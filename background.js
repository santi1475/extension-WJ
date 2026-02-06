chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_LOGIN") {
    
    chrome.storage.sync.get(['targetOrigin'], (items) => {
      const authorizedOrigin = items.targetOrigin;
      
      if (authorizedOrigin && sender.origin === authorizedOrigin) {
         handleLogin(message.payload);
         sendResponse({status: "started"});
      } else {
         console.warn(`Intento de acceso no autorizado desde: ${sender.origin}`);
         sendResponse({status: "ignored", reason: "unauthorized"});
      }
    });

    return true;
  }
});

async function handleLogin(data) {
  const { url, credenciales, tipo } = data;
  console.log("Iniciando automatización en:", url);
  
  await clearCookiesForUrl(url);

  chrome.windows.create({
    url: url,
    type: "popup",
    state: "maximized",
    focused: true
  }, (window) => {
    if (!window || !window.tabs || window.tabs.length === 0) return;
    
    const tabId = window.tabs[0].id;
    
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {        
        
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: fillFormLogic,
          args: [credenciales, tipo], 
        })
        .then(() => {
             console.log("Script inyectado exitosamente.");
             chrome.tabs.onUpdated.removeListener(listener); 
        })
        .catch((err) => {
             console.log("Esperando redirección o carga final...", err.message);
        });
      }
    });
  });
}

function fillFormLogic(creds, tipo) {
  const strategies = {
    SUNAT_SOL: () => {
      const ruc = document.querySelector('input[name="nroRuc"]') || document.getElementById("txtRuc");
      const user = document.querySelector('input[name="usuario"]') || document.getElementById("txtUsuario");
      const pass = document.querySelector('input[name="password"]') || document.getElementById("txtContrasena");
      const btn = document.getElementById("btnAceptar");

      if (ruc && user && pass) {
        ruc.value = creds.ruc;
        user.value = creds.usuario;
        pass.value = creds.clave;

        ruc.dispatchEvent(new Event("input", { bubbles: true }));
        user.dispatchEvent(new Event("input", { bubbles: true }));
        pass.dispatchEvent(new Event("input", { bubbles: true }));

        if (btn) btn.click();
      }
    },
  };

  if (strategies[tipo]) strategies[tipo]();
}

function clearCookiesForUrl(url) {
  return new Promise((resolve) => {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        chrome.cookies.getAll({ domain: domain }, function(cookies) {
          if (!cookies || cookies.length === 0) { resolve(); return; }
          let pending = cookies.length;
          cookies.forEach(function(cookie) {
            const protocol = cookie.secure ? "https:" : "http:";
            const cookieUrl = `${protocol}//${cookie.domain}${cookie.path}`;
            chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
              pending--;
              if (pending <= 0) resolve();
            });
          });
        });
    } catch (e) { resolve(); }
  });
}