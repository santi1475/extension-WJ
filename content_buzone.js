document.addEventListener('BUZONE_LOGIN_REQUEST', function(e) {
const loginData = e.detail;
console.log("Extensión: Solicitud recibida desde ERP", loginData);

chrome.runtime.sendMessage({
    action: "START_LOGIN",
    payload: loginData
});
});

console.log("Inicio Completo");