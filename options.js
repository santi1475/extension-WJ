const els = {
  erpInput: document.getElementById('erpInput'),
  erpBadge: document.getElementById('erpBadge'),
  btnSaveErp: document.getElementById('btnSaveErp'),
  targetInput: document.getElementById('targetInput'),
  btnAddTarget: document.getElementById('btnAddTarget'),
  permList: document.getElementById('permList'),
  status: document.getElementById('status'),
  chkUseTabMode: document.getElementById('chkUseTabMode')
};

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['targetOrigin'], (res) => {
    // Si no hay configuración previa, mostrar tu dominio oficial como default (sin obligar al usuario a guardar).
    const fallback = 'https://wjasesoriaerp.com';
    updateErpUI(res.targetOrigin || fallback);
  });
  
  // Cargar configuración local de este dispositivo
  chrome.storage.local.get(['useTabMode'], (res) => {
    if (els.chkUseTabMode) {
      els.chkUseTabMode.checked = !!res.useTabMode;
    }
  });

  loadPermissions();
});

// Guardar configuración local al cambiar el checkbox
els.chkUseTabMode.addEventListener('change', (e) => {
  chrome.storage.local.set({ useTabMode: e.target.checked }, () => {
    showToast('Ajuste del dispositivo guardado', 'success');
  });
});

els.btnSaveErp.addEventListener('click', async () => {
  const url = validateUrl(els.erpInput.value);
  if (!url) return;

  const origin = url.origin;

  try {
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`]
    });

    if (granted) {
      chrome.storage.sync.set({ targetOrigin: origin }, async () => {
        
        await registerDynamicScript(origin);
        
        updateErpUI(origin);
        showToast('ERP Vinculado e Inyectado Correctamente', 'success');
      });
    } else {
      showToast('Permiso denegado por el usuario', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Error: ' + err.message, 'error');
  }
});

async function registerDynamicScript(origin) {
  const scriptId = 'erp-dynamic-connection';
  
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
  } catch (e) { /* Ignorar si no existía */ }

  await chrome.scripting.registerContentScripts([{
    id: scriptId,
    js: ['content_WJ.js'],
    matches: [`${origin}/*`],
    runAt: 'document_start',
  }]);
}

els.btnAddTarget.addEventListener('click', async () => {
  const url = validateUrl(els.targetInput.value);
  if (!url) return;
  try {
    const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
    if (granted) {
      els.targetInput.value = '';
      loadPermissions();
      showToast(`Acceso concedido a: ${url.origin}`, 'success');
    }
  } catch (e) { showToast('Error al solicitar permiso', 'error'); }
});

async function loadPermissions() {
  const perms = await chrome.permissions.getAll();
  els.permList.innerHTML = '';
  (perms.origins || []).forEach(origin => {
    if(!origin.includes('://')) return;
    const li = document.createElement('li');
    li.className = 'site-item';
    li.innerHTML = `<span>${origin}</span><button class="remove-btn" onclick="removePerm('${origin}')">❌</button>`;
    els.permList.appendChild(li);
  });
}

window.removePerm = async (origin) => {
  await chrome.permissions.remove({ origins: [origin] });
  loadPermissions();
};

function updateErpUI(origin) {
  els.erpInput.value = origin;
  els.erpBadge.textContent = "Conectado";
  els.erpBadge.className = "badge active";
}

function validateUrl(str) {
  try { return new URL(str); } catch { showToast('URL Inválida', 'error'); return null; }
}

function showToast(msg, type) {
  els.status.textContent = msg;
  els.status.style.display = 'block';
  els.status.style.background = type === 'success' ? '#16a34a' : '#dc2626';
  setTimeout(() => els.status.style.display = 'none', 3000);
}