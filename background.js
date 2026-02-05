chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_LOGIN") {
    
    chrome.storage.sync.get(['targetUrl'], (items) => {
      const configuredOrigin = items.targetUrl || "http://localhost:3000";
      
      if (sender.origin.startsWith(configuredOrigin) || sender.url.startsWith(configuredOrigin)) {
         handleLogin(message.payload);
         sendResponse({status: "started"});
      } else {
         console.warn(`Origen ${sender.origin} no coincide con la configuración ${configuredOrigin}`);
         sendResponse({status: "ignored", reason: "origin_mismatch"});
      }
    });

    return true; // Indicates that sendResponse will be called asynchronously
  }
});

async function handleLogin(data) {
  const { url, credenciales, tipo } = data;
  console.log("Iniciando proceso para:", url);
  
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
             console.log("Intento de inyección fallido (posible redirección):", err.message);
             // No removemos el listener, esperamos al siguiente evento 'complete'
        });
      }
    });
  });
}

function fillFormLogic(creds, tipo) {
  const strategies = {
    SUNAT_SOL: () => {
      console.log("   - Ejecutando estrategia SUNAT_SOL");
      const ruc = document.querySelector('input[name="nroRuc"]') || document.getElementById("txtRuc");
      console.log("   - Campo RUC encontrado:", !!ruc);
      
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

        console.log("   - Valores asignados. Intentando click...");
        if (btn) btn.click();
      } else {
        console.error("ERROR: Datos incompletos para SUNAT_SOL");
      }
    },
  };

  if (strategies[tipo]) {
    strategies[tipo]();
  } else {
    console.error("No hay estrategia para:", tipo);
  }
}

function clearCookiesForUrl(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    chrome.cookies.getAll({ domain: domain }, function(cookies) {
      if (cookies.length === 0) {
        resolve();
        return;
      }

      let pending = cookies.length;
      cookies.forEach(function(cookie) {
        const protocol = cookie.secure ? "https:" : "http:";
        const cookieUrl = `${protocol}//${cookie.domain}${cookie.path}`;

        chrome.cookies.remove({
          url: cookieUrl,
          name: cookie.name
        }, function() {
          pending--;
          if (pending <= 0) resolve();
        });
      });
    });
  });
}