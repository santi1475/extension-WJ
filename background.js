chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_LOGIN") {
    handleLogin(message.payload);
  }
});

function handleLogin(data) {
  const { url, credenciales, tipo } = data;

  chrome.tabs.create({ url: url, active: true }, (tab) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);

        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: fillFormLogic,
          args: [credenciales, tipo],
        });
      }
    });
  });
}
function fillFormLogic(creds, tipo) {
  console.log("Procesando: ", tipo);

  const strategies = {
    SUNAT_SOL: () => {
      const ruc =
        document.querySelector('input[name="nroRuc"]') ||
        document.getElementById("txtRuc");
      const user =
        document.querySelector('input[name="usuario"]') ||
        document.getElementById("txtUsuario");
      const pass =
        document.querySelector('input[name="password"]') ||
        document.getElementById("txtContrasena");
      const btn = document.getElementById("btnAceptar");

      if (ruc && user && pass) {
        ruc.value = creds.ruc;
        user.value = creds.usuario;
        pass.value = creds.clave;

        ruc.dispatchEvent(new Event("input", { bubbles: true }));
        user.dispatchEvent(new Event("input", { bubbles: true }));
        pass.dispatchEvent(new Event("input", { bubbles: true }));

        if (btn) btn.click();
      } else {
        alert("No encontré los campos. ¿Cambió SUNAT su web?");
      }
    },
    SUNAT_NUEVA: () => {
      const ruc = document.getElementById("txtRuc");
      const user = document.getElementById("txtUsuario");
      const pass = document.getElementById("txtContrasena");
      const btn = document.getElementById("btnAceptar");

      if (ruc && user && pass) {
        ruc.value = creds.ruc;
        user.value = creds.usuario;
        pass.value = creds.clave;
        if (btn) btn.click();
      }
    },
  };

  if (strategies[tipo]) {
    strategies[tipo]();
  } else {
    console.error("No hay estrategia definida para:", tipo);
  }
}
