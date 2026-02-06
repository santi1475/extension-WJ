document.getElementById('btnGrant').addEventListener('click', async () => {
  const rawUrl = document.getElementById('urlInput').value.trim();
  const statusDiv = document.getElementById('status');
  
  if (!rawUrl) {
    showStatus("Por favor ingresa una URL válida.", "error");
    return;
  }

  let origin;
  try {
    const urlObj = new URL(rawUrl);
    origin = urlObj.origin; 
  } catch (e) {
    showStatus("URL inválida. Asegúrate de incluir http:// o https://", "error");
    return;
  }

  try {
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`]
    });

    if (granted) {
      await registerScript(origin);
      
      chrome.storage.sync.set({ targetOrigin: origin });
      updateCurrentOriginUI(origin);
      
      showStatus(`¡Éxito! Extensión conectada a: ${origin}`, "success");

      chrome.tabs.query({url: `${origin}/*`}, (tabs) => {
          tabs.forEach(t => chrome.tabs.reload(t.id));
      });
    } else {
      showStatus("Permiso denegado por el usuario.", "error");
    }
  } catch (err) {
    console.error(err);
    showStatus("Error: " + err.message, "error");
  }
});

async function registerScript(origin) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["wj-script"] });
  } catch (e) {  }

  await chrome.scripting.registerContentScripts([{
    id: "wj-script",
    matches: [`${origin}/*`],
    js: ["content_WJ.js"],
    runAt: "document_end"
  }]);
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = type;
  el.style.display = 'block';
}

function updateCurrentOriginUI(origin) {
  document.getElementById('currentOrigin').textContent = origin || "Ninguno";
}

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['targetOrigin'], (res) => {
    if (res.targetOrigin) {
      document.getElementById('urlInput').value = res.targetOrigin;
      updateCurrentOriginUI(res.targetOrigin);
      registerScript(res.targetOrigin); 
    }
  });
});