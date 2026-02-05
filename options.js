// Guardar opciones
document.getElementById('save').addEventListener('click', () => {
  const targetUrl = document.getElementById('targetUrl').value;
  
  chrome.storage.sync.set({ targetUrl: targetUrl }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Opciones guardadas exitosamente.';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});

// Cargar opciones al abrir
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['targetUrl'], (items) => {
    if (items.targetUrl) {
      document.getElementById('targetUrl').value = items.targetUrl;
    } else {
      // Valor por defecto
      document.getElementById('targetUrl').value = "http://localhost:3000";
    }
  });
});