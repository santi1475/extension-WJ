const els = {
  erpInput: document.getElementById('erpInput'),
  erpBadge: document.getElementById('erpBadge'),
  btnSaveErp: document.getElementById('btnSaveErp'),
  targetInput: document.getElementById('targetInput'),
  btnAddTarget: document.getElementById('btnAddTarget'),
  permList: document.getElementById('permList'),
  status: document.getElementById('status')
};

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['targetOrigin'], (res) => {
    if (res.targetOrigin) updateErpUI(res.targetOrigin);
  });
  loadPermissions();
});

els.btnSaveErp.addEventListener('click', () => {
  const url = validateUrl(els.erpInput.value);
  if (!url) return;
  chrome.storage.sync.set({ targetOrigin: url.origin }, () => {
    updateErpUI(url.origin);
    showToast('ERP Conectado Correctamente', 'success');
  });
});

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