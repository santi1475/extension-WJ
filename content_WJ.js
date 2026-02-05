document.addEventListener('WJ_LOGIN_REQUEST', function(e) {
const loginData = e.detail;
console.log("Extensión: Solicitud recibida desde ERP", loginData);

chrome.runtime.sendMessage({
    action: "START_LOGIN",
    payload: loginData
}, (response) => {
    if (chrome.runtime.lastError) {
        console.warn("WJ Extension: No se pudo conectar con la extensión. Es posible que se haya recargado. Por favor, recargue esta página.", chrome.runtime.lastError.message);
    }
});
});

console.log("Inicio Completo");