chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_LOGIN") {
    console.log("Iniciando login desde:", sender.origin);
    
    // Validar origen permitido (opcional si ya se confía en el content script)
    // Pero es buena práctica verificar
    const allowedOrigins = [
      "http://localhost:3000", 
      "https://wj-front.vercel.app", 
      "https://app.alphatech.com" // Ajustar según producción
    ];

    const isAllowed = allowedOrigins.some(origin => sender.origin.startsWith(origin));

    if (isAllowed || true) { // TODO: Refinar seguridad en prod
        handleLogin(message.payload, sender.tab.id);
        sendResponse({status: "processing"});
    } else {
        console.warn(`Acceso denegado a: ${sender.origin}`);
        sendResponse({status: "denied"});
    }
    return true; // Asíncrono
  }
});

async function handleLogin(data, callerTabId) {
  const { url, pasos } = data;
  
  // Notificar inicio
  notifyCaller(callerTabId, "INFO", "Limpiando cookies y abriendo ventana...");

  await clearCookiesForUrl(url);

  chrome.windows.create({ url: url, type: "popup", state: "maximized" }, (win) => {
    if (!win || !win.tabs || win.tabs.length === 0) {
        notifyCaller(callerTabId, "ERROR", "No se pudo crear la ventana de login.");
        return;
    }
    const tabId = win.tabs[0].id;

    // Escuchar actualizaciones de la pestaña de login
    chrome.tabs.onUpdated.addListener(function listener(uTabId, info) {
      if (uTabId === tabId && info.status === "complete") {
        
        notifyCaller(callerTabId, "INFO", "Página cargada. Ejecutando scripts...");

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: genericExecutor,
          args: [pasos], 
        }, (results) => {
            if (chrome.runtime.lastError) {
                notifyCaller(callerTabId, "ERROR", "Error de ejecución: " + chrome.runtime.lastError.message);
                return;
            }
            
            // Verificar resultado del script
            if (results && results[0] && results[0].result) {
                const res = results[0].result;
                if (res.success) {
                    notifyCaller(callerTabId, "SUCCESS", "Credenciales ingresadas correctamente.");
                } else {
                    notifyCaller(callerTabId, "ERROR", "Fallo en la automatización: " + res.error);
                }
            }
        });

        // Remover listener para no ejecutar múltiples veces en recargas
        chrome.tabs.onUpdated.removeListener(listener); 
      }
    });
  });
}

function notifyCaller(tabId, type, message) {
    if (tabId) {
        chrome.tabs.sendMessage(tabId, {
            action: "LOGIN_STATUS_UPDATE",
            type: type, // INFO, SUCCESS, ERROR
            message: message
        }).catch(err => console.log("No se pudo notificar a la tab:", err));
    }
}

// Esta función se ejecuta EN EL CONTEXTO DE LA PÁGINA DE SUNAT
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
        setTimeout(() => { obs.disconnect(); res(null); }, 10000); // 10s timeout
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
                el.dispatchEvent(new Event('blur', {bubbles:true})); // A veces necesario
            } else if (p.accion === 'click') {
                el.click();
            }
            
            await new Promise(r => setTimeout(r, 500)); // Espera entre pasos
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