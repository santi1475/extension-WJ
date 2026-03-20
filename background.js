chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_LOGIN") {
    console.log("Solicitud de login recibida desde:", sender.origin);
    
    chrome.storage.sync.get(['targetOrigin'], (result) => {
      const authorizedErp = result.targetOrigin;
      
      const allowedOrigins = [
        authorizedErp,
        "http://localhost:3000"
      ];

      const isAllowed = allowedOrigins.some(allowed => allowed && sender.origin.startsWith(allowed));

      if (isAllowed) {
          handleLogin(message.payload, sender.tab.id, sender.tab.windowId);
          sendResponse({status: "processing"});
      } else {
          console.warn(`BLOQUEADO: Intento de login desde ${sender.origin}. Esperaba: ${authorizedErp}`);
          sendResponse({status: "denied", reason: "Origin not authorized in Options"});
      }
    });
    
    return true; 
  }
});

async function handleLogin(data, callerTabId, callerWindowId) {
  const { url, pasos, openInTab } = data;
  
  notifyCaller(callerTabId, "INFO", "Limpiando cookies...");

  // ANTES de limpiar
  const cookiesAntes = await chrome.cookies.getAll({ url: url });
  console.log('[WJ Extension] Cookies ANTES de limpiar:', 
    cookiesAntes.map(c => ({ name: c.name, value: c.value }))
  );

  await clearCookiesForUrl(url);

  // DESPUÉS de limpiar
  const cookiesDespues = await chrome.cookies.getAll({ url: url });
  console.log('[WJ Extension] Cookies DESPUÉS de limpiar:', cookiesDespues);

  if (openInTab) {
    chrome.tabs.create({ url: url, windowId: callerWindowId, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
          notifyCaller(callerTabId, "ERROR", "No se pudo crear la pestaña de login.");
          return;
      }
      setupInjectionListener(tab.id, callerTabId, pasos);
    });
  } else {
    chrome.windows.create({ url: url, type: "popup", state: "maximized" }, (win) => {
      if (chrome.runtime.lastError || !win || !win.tabs || win.tabs.length === 0) {
          notifyCaller(callerTabId, "ERROR", "No se pudo crear la ventana de login.");
          return;
      }
      setupInjectionListener(win.tabs[0].id, callerTabId, pasos);
    });
  }
}

function setupInjectionListener(tabId, callerTabId, pasos) {
    let intentos = 0;
    let inyectando = false;
    let fallbackTimeout = null;
    const MAX_INTENTOS = 15; 

    const updateListener = function(uTabId, info, tab) {
      if (uTabId !== tabId) return;

      if (info.status === "loading") {
          console.log(`[WJ Extension] Página recargando/redirigiendo. Reseteando candado de inyección.`);
          inyectando = false;
          if (fallbackTimeout) clearTimeout(fallbackTimeout);
      }

      // Solo nos interesa cuando la carga está COMPLETA
      if (info.status === "complete") {
        
        if (inyectando) {
            console.log(`[WJ Extension] Ignorando evento complete, ya hay una inyección en progreso.`);
            return;
        }

        if (intentos >= MAX_INTENTOS) {
            console.error(`[WJ Extension] Se alcanzó el límite de ${MAX_INTENTOS} intentos. SUNAT está en un loop de redirección.`);
            notifyCaller(callerTabId, "ERROR", `Login fallido: SUNAT redirigió ${MAX_INTENTOS} veces sin mostrar el formulario.`);
            chrome.tabs.onUpdated.removeListener(updateListener);
            return;
        }

        inyectando = true;

        const currentUrl = tab?.url || '';
        console.log(`[WJ Extension] Intento de inyección #${intentos + 1} en URL: ${currentUrl}`);

        const postLoginPatterns = [
            // SUNAT Menu
            { test: (u) => (u.includes('MenuInternet.htm') || u.includes('AutenticaMenuInternetPlataforma.htm')) && u.includes('pestana='), name: "SUNAT" },
            // MITRA (Ministerio de Trabajo)
            { test: (u) => u.includes('trabajo.gob.pe/sigac/app'), name: "MITRA" },
            // SUNAFIL Casilla
            { test: (u) => u.includes('sunafil.gob.pe/si.inbox') && !u.includes('oauth2/login'), name: "SUNAFIL" },
        ];

        const matchedPattern = postLoginPatterns.find(p => p.test(currentUrl));
        if (matchedPattern) {
            console.log(`[WJ Extension] ✅ Autenticación exitosa detectada (${matchedPattern.name}) por URL post-login: ${currentUrl}`);
            notifyCaller(callerTabId, "SUCCESS", `Login exitoso en ${matchedPattern.name} — sesión activa detectada.`);
            chrome.tabs.onUpdated.removeListener(updateListener);
            inyectando = false;
            return;
        }

        notifyCaller(callerTabId, "INFO", "Página detectada. Intentando inyectar credenciales...");

        fallbackTimeout = setTimeout(() => {
            if (inyectando) {
                console.warn(`[WJ Extension] Timeout de seguridad (15s): executeScript no retornó. Reseteando candado.`);
                inyectando = false;
            }
        }, 15000);

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: genericExecutor,
          args: [pasos], 
        }, (results) => {
            inyectando = false;
            if (fallbackTimeout) clearTimeout(fallbackTimeout);

            const err = chrome.runtime.lastError;
            
            console.log(`[WJ Extension] Callback de executeScript. Error:`, err?.message, `| Resultados crudos:`, results);

            if (err) {
                if (err.message.includes("Frame with ID 0 was removed") || err.message.includes("The tab was closed")) {
                    console.warn(`[WJ Extension] Detectada redirección rápida o cierre. Esperando...`);
                    return; // No removemos el listener, esperamos al next complete
                }

                console.error(`[WJ Extension] Error fatal al inyectar:`, err.message);
                notifyCaller(callerTabId, "ERROR", "Error fatal: " + err.message);
                chrome.tabs.onUpdated.removeListener(updateListener);
                return;
            }

            // Si result es null, la página redirigió y Chrome destruyó el script.
            // NO removemos el listener — esperamos al siguiente "complete" en la página final.
            if (!results || !results[0] || results[0].result === null || results[0].result === undefined) {
                console.warn(`[WJ Extension] Resultado nulo — la página redirigió durante la inyección. Esperando siguiente carga...`);
                return; // Mantener listener vivo
            }

            chrome.tabs.onUpdated.removeListener(updateListener);
            const res = results[0].result;
            if (res.success) {
                console.log(`[WJ Extension] -> ÉXITO devuelto por la pestaña`);
                notifyCaller(callerTabId, "SUCCESS", "Credenciales ingresadas correctamente.");
            } else {
                console.error(`[WJ Extension] -> FALLO devuelto por la pestaña:`, res.error);
                notifyCaller(callerTabId, "ERROR", "Fallo en la automatización: " + res.error);
            }
        });
        
        intentos++;
      }
    };

    // Activamos el listener
    chrome.tabs.onUpdated.addListener(updateListener);
}

function notifyCaller(tabId, type, message) {
    if (tabId) {
        chrome.tabs.sendMessage(tabId, {
            action: "LOGIN_STATUS_UPDATE",
            type: type,
            message: message
        }).catch(err => console.log("No se pudo notificar a la tab:", err));
    }
}

function genericExecutor(pasos) {
  return new Promise(async (resolve) => {
    const wait = (sel) => new Promise(res => {
        const el = document.querySelector(sel);
        if(el) return res(el);
        const obs = new MutationObserver(() => {
        const e = document.querySelector(sel);
        if(e) { obs.disconnect(); res(e); }
        });
        obs.observe(document.body, {childList:true, subtree:true});
        setTimeout(() => { obs.disconnect(); res(null); }, 10000);
    });

    try {
        for (const p of pasos) {
            const el = await wait(p.selector);
            if(!el) {
                const pageInfo = {
                    url: window.location.href,
                    title: document.title,
                    inputs: Array.from(document.querySelectorAll('input')).map(i => ({
                        id: i.id, name: i.name, type: i.type, placeholder: i.placeholder,
                        className: i.className
                    })),
                    forms: Array.from(document.querySelectorAll('form')).map(f => ({
                        id: f.id, action: f.action, method: f.method
                    })),
                    buttons: Array.from(document.querySelectorAll('button, input[type="submit"]')).map(b => ({
                        id: b.id, text: b.textContent?.trim(), type: b.type
                    })),
                    bodySnippet: document.body?.innerText?.substring(0, 500)
                };
                console.error(`[WJ Extension] Selector no encontrado: ${p.selector}. Diagnóstico de la página:`, pageInfo);
                return resolve({ success: false, error: `Selector no encontrado: ${p.selector}` });
            }
            
            console.log(`[WJ Extension] Procesando paso con selector: ${p.selector}, acción: ${p.accion}`);
            
            if (p.accion === 'escribir') {
                console.log(`[WJ Extension] Valor actual antes de inyectar: "${el.value}"`);
                
                el.focus();
                el.value = '';
                el.dispatchEvent(new Event('input', {bubbles: true}));

                for (const char of p.valor) {
                    el.dispatchEvent(new KeyboardEvent('keydown', {key: char, code: 'Key' + char.toUpperCase(), bubbles: true}));
                    el.dispatchEvent(new KeyboardEvent('keypress', {key: char, code: 'Key' + char.toUpperCase(), bubbles: true}));
                    
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeSetter.call(el, el.value + char);
                    
                    el.dispatchEvent(new InputEvent('input', {
                        bubbles: true,
                        inputType: 'insertText',
                        data: char
                    }));
                    
                    el.dispatchEvent(new KeyboardEvent('keyup', {key: char, code: 'Key' + char.toUpperCase(), bubbles: true}));
                }
                
                // Eventos finales
                el.dispatchEvent(new Event('change', {bubbles: true}));
                el.dispatchEvent(new Event('blur', {bubbles: true}));
                
                console.log(`[WJ Extension] Valor tras simular tipeo: "${el.value}" (esperado: "${p.valor}")`);
                
            } else if (p.accion === 'click') {
                const inputs = document.querySelectorAll('input');
                const inputsState = Array.from(inputs).map(i => ({ id: i.id, name: i.name, type: i.type, value: i.value }));
                console.log(`[WJ Extension] Haciendo click en ${p.selector} - Estado de campos input:`, inputsState);
                el.click();
            }
            
            await new Promise(r => setTimeout(r, 500)); 
        }
        console.log(`[WJ Extension] Ejecución exitosa de todos los pasos.`);
        resolve({ success: true });
    } catch(e) { 
        console.error(`[WJ Extension] Excepción en genericExecutor:`, e);
        resolve({ success: false, error: e.toString() });
    }
  });
}

async function clearCookiesForUrl(url) {
  try {
      const cookies = await chrome.cookies.getAll({ domain: 'sunat.gob.pe' });
      
      console.log(`[WJ Extension] Cookies a eliminar (${cookies.length}):`, 
        cookies.map(c => ({ name: c.name, domain: c.domain, path: c.path }))
      );

      for (const cookie of cookies) {
        // Construir la URL exacta con el dominio y path específico de CADA cookie
        const cookieUrl = `https://${cookie.domain.startsWith('.') 
          ? cookie.domain.slice(1) 
          : cookie.domain}${cookie.path}`;
        
        try {
          await chrome.cookies.remove({ 
            url: cookieUrl, 
            name: cookie.name 
          });
          console.log(`[WJ Extension] Eliminada: ${cookie.name} en ${cookieUrl}`);
        } catch(e) {
          console.warn(`[WJ Extension] No se pudo eliminar: ${cookie.name} en ${cookieUrl}`, e);
        }
      }

      const restantes = await chrome.cookies.getAll({ domain: 'sunat.gob.pe' });
      console.log(`[WJ Extension] Cookies restantes: ${restantes.length}`, 
        restantes.map(c => ({ name: c.name, domain: c.domain, path: c.path }))
      );
  } catch (err) {
      console.error("[WJ Extension] Error limpiando cookies", err);
  }
}