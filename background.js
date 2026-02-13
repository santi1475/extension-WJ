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
          handleLogin(message.payload, sender.tab.id);
          sendResponse({status: "processing"});
      } else {
          console.warn(`BLOQUEADO: Intento de login desde ${sender.origin}. Esperaba: ${authorizedErp}`);
          sendResponse({status: "denied", reason: "Origin not authorized in Options"});
      }
    });
    
    return true; 
  }
});

async function handleLogin(data, callerTabId) {
  const { url, pasos } = data;
  
  notifyCaller(callerTabId, "INFO", "Limpiando cookies y abriendo ventana...");

  await clearCookiesForUrl(url);

  chrome.windows.create({ url: url, type: "popup", state: "maximized" }, (win) => {
    if (!win || !win.tabs || win.tabs.length === 0) {
        notifyCaller(callerTabId, "ERROR", "No se pudo crear la ventana de login.");
        return;
    }
    const tabId = win.tabs[0].id;
    let intentos = 0; // Para evitar bucles infinitos

    // Listener con nombre para poder removerlo después
    const updateListener = function(uTabId, info) {
      // Solo nos interesa cuando la carga está COMPLETA
      if (uTabId === tabId && info.status === "complete") {
        
        console.log(`Intento de inyección #${intentos + 1}`);
        notifyCaller(callerTabId, "INFO", "Página detectada. Intentando inyectar credenciales...");

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: genericExecutor,
          args: [pasos], 
        }, (results) => {
            const err = chrome.runtime.lastError;
            
            if (err) {
                if (err.message.includes("Frame with ID 0 was removed")) {
                    console.warn("Detectada redirección rápida. Esperando siguiente carga...");
                    return;
                }

                notifyCaller(callerTabId, "ERROR", "Error fatal: " + err.message);
                chrome.tabs.onUpdated.removeListener(updateListener);
                return;
            }

            chrome.tabs.onUpdated.removeListener(updateListener);
                        if (results && results[0] && results[0].result) {
                const res = results[0].result;
                if (res.success) {
                    notifyCaller(callerTabId, "SUCCESS", "Credenciales ingresadas correctamente.");
                } else {
                    notifyCaller(callerTabId, "ERROR", "Fallo en la automatización: " + res.error);
                }
            }
        });
        
        intentos++;
      }
    };

    // Activamos el listener
    chrome.tabs.onUpdated.addListener(updateListener);
  });
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
                return resolve({ success: false, error: `Selector no encontrado: ${p.selector}` });
            }
            
            if (p.accion === 'escribir') {
                el.value = p.valor;
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
                el.dispatchEvent(new Event('blur', {bubbles:true}));
            } else if (p.accion === 'click') {
                el.click();
            }
            
            await new Promise(r => setTimeout(r, 500)); 
        }
        resolve({ success: true });
    } catch(e) { 
        resolve({ success: false, error: e.toString() });
    }
  });
}

function clearCookiesForUrl(url) {
  return new Promise(r => {
    try {
      const domain = new URL(url).hostname;
      chrome.cookies.getAll({domain}, cookies => {
        const proms = cookies.map(c => chrome.cookies.remove({
          url: (c.secure ? "https://" : "http://") + c.domain + c.path, name: c.name
        }));
        Promise.all(proms).then(r);
      });
    } catch { r(); }
  });
}