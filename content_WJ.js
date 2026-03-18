document.addEventListener('WJ_LOGIN_REQUEST', function(e) {
  const loginData = e.detail;
  const safeData = {
      ...loginData,
      pasos: loginData.pasos?.map(p => ({
          ...p,
          valor: (p.accion === 'escribir' ? (p.selector.includes('Contrasena') ? '***' : p.valor) : p.valor)
      }))
  };
  console.log("[WJ Content] Evento DOM WJ_LOGIN_REQUEST interceptado desde Front. Payload:", safeData);

  chrome.runtime.sendMessage({
      action: "START_LOGIN",
      payload: loginData
  }, (response) => {
      if (chrome.runtime.lastError) {
          console.warn("WJ Extension: No se pudo conectar con la extensión.", chrome.runtime.lastError.message);
          dispatchStatus("ERROR", "No se pudo conectar con la extensión. Rxecargue la página.");
      } else {
        console.log("Respuesta inicial extensión:", response);
      }
  });
});

// Escuchar mensajes del background script (Progreso / Errores / Éxito)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "LOGIN_STATUS_UPDATE") {
    console.log("Extensión Status Update:", message);
    dispatchStatus(message.type, message.message);
  }
});

function dispatchStatus(type, text) {
  const event = new CustomEvent("WJ_LOGIN_STATUS", { 
    detail: { type: type, message: text } 
  });
  document.dispatchEvent(event);
}

console.log("Inicio Completo - WJ Content Script Ready");