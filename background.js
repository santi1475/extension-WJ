chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  
  const allowedOrigins = ["http://localhost:3000", "https://midominio-erp.com"];
  const isAllowed = allowedOrigins.some(origin => sender.url.startsWith(origin));

  if (!isAllowed) {
     console.warn("Origen no permitido:", sender.url);
     return;
  }

  if (message.action === "START_LOGIN") {
    handleLogin(message.payload);
  }
});

async function handleLogin(data) {
  const { url, credenciales, tipo } = data;
  console.log("Limpiando sesión anterior...");
  
  await clearCookiesForUrl(url);

  chrome.windows.create({
    url: url,
    type: "popup",
    state: "maximized",
    focused: true
  }, (window) => {
    if (!window || !window.tabs || window.tabs.length === 0) {
        console.error("ERROR: No se pudo crear la ventana o no tiene pestañas.");
        return;
    }
    
    const tabId = window.tabs[0].id;
    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {        
        chrome.tabs.onUpdated.removeListener(listener);

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: fillFormLogic,
          args: [credenciales, tipo], 
        })
        .then(() => console.log("Script inyectado exitosamente."))
        .catch((err) => console.error("ERROR al inyectar script:", err));
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