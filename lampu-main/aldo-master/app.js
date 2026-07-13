// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://vfjwilyvjslgfkerobxw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmandpbHl2anNsZ2ZrZXJvYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzYzOTYsImV4cCI6MjA5NjY1MjM5Nn0.FDe7rCu5BO3CVhAGJUKjvWyEreWYsOPDcreSOpeuCv4";

const HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
};

// ==========================================
// SNI 03-6197-2000 — AMBANG BATAS LUX
// ==========================================
const SNI_THRESHOLDS = {
    ruang_tamu:  { min: 120, max: 150 },
    ruang_makan: { min: 120, max: 250 },
    ruang_kerja: { min: 120, max: 250 },
    ruang_tidur: { min: 120, max: 250 },
    kamar_mandi: { min: 250, max: 500 },
    dapur:       { min: 250, max: 500 },
    teras:       { min:  60, max: 120 },
    garasi:      { min:  60, max: 120 },
};

// ==========================================
// MODE CONFIGURATION
// ==========================================
const MODES = [
    { key: 'ruang_tidur', label: 'Ruang Tidur',  icon: '🛏️' },
    { key: 'ruang_tamu',  label: 'Ruang Tamu',   icon: '🛋️' },
    { key: 'ruang_makan', label: 'Ruang Makan',  icon: '🍽️' },
    { key: 'ruang_kerja', label: 'Ruang Kerja',  icon: '💻' },
    { key: 'kamar_mandi', label: 'Kamar Mandi',  icon: '🚿' },
    { key: 'dapur',       label: 'Dapur',         icon: '🍳' },
    { key: 'teras',       label: 'Teras',         icon: '🏡' },
    { key: 'garasi',      label: 'Garasi',        icon: '🚗' },
];

// ==========================================
// STATE
// ==========================================
let currentDeviceId   = null;
let luxChart          = null;
let pollingInterval   = null;
let homeRefreshInterval = null;
let selectedModeModal = null;
let devices           = [];

// ==========================================
// INIT
// ==========================================
async function initApp() {
    renderModalModes();
    await loadDevices();
    homeRefreshInterval = setInterval(loadDevices, 4000);
}

// ==========================================
// LOAD ALL DEVICES
// ==========================================
async function loadDevices() {
    try {
        // Hapus order=created_at karena kolom tersebut mungkin belum ada
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/devices?select=*`,
            { headers: HEADERS }
        );

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const data = await res.json();

        // Validasi response adalah array
        if (!Array.isArray(data)) {
            throw new Error('Response bukan array: ' + JSON.stringify(data));
        }

        devices = data;
        renderDeviceList(devices);
        hideLoadError();

        // Refresh detail stats jika view detail sedang terbuka
        if (currentDeviceId) {
            const device = devices.find(d => d.id === currentDeviceId);
            if (device) updateDetailUI(device);
        }
    } catch (e) {
        console.error('loadDevices error:', e);
        showLoadError(e.message);
    }
}

function showLoadError(msg) {
    let el = document.getElementById('load-error-banner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'load-error-banner';
        el.style.cssText = [
            'background:rgba(239,68,68,0.1)',
            'border:1px solid rgba(239,68,68,0.3)',
            'border-radius:12px',
            'padding:10px 14px',
            'font-size:12px',
            'color:#f87171',
            'display:flex',
            'align-items:center',
            'justify-content:space-between',
            'gap:8px'
        ].join(';');
        const grid = document.getElementById('device-grid');
        grid.parentNode.insertBefore(el, grid);
    }
    el.innerHTML = `
        <span>⚠️ Gagal memuat device: ${msg}</span>
        <button onclick="loadDevices()" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:8px;padding:4px 10px;color:#f87171;font-size:11px;cursor:pointer;font-family:Outfit,sans-serif">Coba Lagi</button>
    `;
    el.style.display = 'flex';
}

function hideLoadError() {
    const el = document.getElementById('load-error-banner');
    if (el) el.style.display = 'none';
}

// ==========================================
// RENDER DEVICE LIST (Home View)
// ==========================================
function renderDeviceList(devList) {
    const grid        = document.getElementById('device-grid');
    const placeholder = document.getElementById('device-placeholder');
    const countEl     = document.getElementById('device-count');

    countEl.textContent = `${devList.length} device`;

    if (devList.length === 0) {
        placeholder.style.display = 'flex';
        grid.querySelectorAll('.device-card').forEach(el => el.remove());
        return;
    }
    placeholder.style.display = 'none';

    // Remove stale cards
    const incomingIds = new Set(devList.map(d => d.id));
    grid.querySelectorAll('.device-card').forEach(el => {
        if (!incomingIds.has(el.dataset.id)) el.remove();
    });

    // Add / update cards
    devList.forEach(device => {
        let card = grid.querySelector(`.device-card[data-id="${device.id}"]`);
        if (!card) {
            card = document.createElement('div');
            card.className = 'device-card';
            card.dataset.id = device.id;
            card.addEventListener('click', () => openDevice(device.id));
            grid.appendChild(card);
        }

        const mode = MODES.find(m => m.key === device.mode);
        const icon  = mode ? mode.icon  : '💡';
        const label = mode ? mode.label : (device.mode || '–');
        const isOn  = !!device.is_on;
        const lux   = device.current_lux ?? 0;
        const thr   = SNI_THRESHOLDS[device.mode];
        let sniStatus = 'unknown';
        if (thr) {
            if (!isOn)          sniStatus = 'off';
            else if (lux < thr.min) sniStatus = 'low';
            else if (lux > thr.max) sniStatus = 'high';
            else                sniStatus = 'ok';
        }

        card.innerHTML = `
            <div class="card-top-row">
                <div class="card-icon-wrap ${isOn ? 'icon-on' : ''}">${icon}</div>
                <span class="card-power-dot ${isOn ? 'dot-on' : 'dot-off'}"></span>
            </div>
            <div class="card-name">${device.name || device.id}</div>
            <div class="card-device-id">${device.id}</div>
            <div class="card-stats-row">
                <span class="card-lux-val">☀️ ${lux} lx</span>
                <span class="card-sni-badge sni-${sniStatus}">${getSNILabel(sniStatus)}</span>
            </div>
        `;
    });
}

function getSNILabel(status) {
    const map = { ok: '✓ SNI', low: '↑ Redup', high: '↓ Terang', off: '⚫ OFF', unknown: '–' };
    return map[status] || '–';
}

// ==========================================
// OPEN DEVICE DETAIL
// ==========================================
function openDevice(id) {
    currentDeviceId = id;
    const device = devices.find(d => d.id === id);
    if (!device) return;

    // Stop home refresh while detail is open
    if (homeRefreshInterval) clearInterval(homeRefreshInterval);

    // Slide to detail view
    document.getElementById('view-home').classList.remove('active');
    document.getElementById('view-detail').classList.add('active');

    // Populate
    document.getElementById('detail-name').textContent = device.name || device.id;
    updateDetailUI(device);

    // Init chart then start polling
    initLuxChart();
    pollDetailOnce(id); // immediate first fetch
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => pollDetailOnce(id), 2000);
}

async function pollDetailOnce(id) {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/devices?id=eq.${id}&select=*`,
            { headers: HEADERS }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.length > 0) {
            const device = data[0];
            const idx = devices.findIndex(d => d.id === id);
            if (idx !== -1) devices[idx] = device;
            updateDetailUI(device);
        }
        await refreshChart(id);
    } catch (e) {
        console.error('poll error:', e);
    }
}

// ==========================================
// UPDATE DETAIL UI
// ==========================================
function updateDetailUI(device) {
    const isOn      = !!device.is_on;
    const lux       = device.current_lux ?? 0;
    const bright    = device.current_brightness ?? 0;
    const modeKey   = device.mode || '';
    const modeInfo  = MODES.find(m => m.key === modeKey);
    const thr       = SNI_THRESHOLDS[modeKey];

    // --- Header badge ---
    let modeLabel;
    if (modeInfo) {
        modeLabel = `${modeInfo.icon} ${modeInfo.label} 🔄`;
    } else if (modeKey === 'manual' || modeKey === 'manual_2') {
        modeLabel = '🎚️ Manual 🔄';
    } else {
        modeLabel = (modeKey || '–') + ' 🔄';
    }
    document.getElementById('detail-mode-badge').innerHTML = `<span>${modeLabel}</span>`;
    document.getElementById('online-dot').classList.toggle('dot-online', true);

    // --- Stats ---
    document.getElementById('detail-lux').textContent        = `${lux} lx`;
    document.getElementById('detail-brightness').textContent = `${bright}%`;

    // --- Power toggle ---
    const track = document.getElementById('toggle-track');
    const text  = document.getElementById('power-status-text');
    track.classList.toggle('track-on', isOn);
    text.textContent = isOn ? 'ON' : 'OFF';
    text.style.color = isOn ? '#4ade80' : '#64748b';

    // --- SNI badge (SELALU update, tidak tergantung threshold) ---
    const badge = document.getElementById('sni-status-badge');

    if (!isOn) {
        // Lampu OFF
        badge.textContent = '⚫ Lampu dalam keadaan OFF';
        badge.className   = 'sni-status-badge badge-off';
    } else if (!thr) {
        // Mode tidak dikenali / tidak punya threshold SNI
        badge.textContent = 'ℹ️ Pilih mode ruangan untuk monitoring SNI';
        badge.className   = 'sni-status-badge badge-off';
    } else if (lux < thr.min) {
        badge.textContent = `⬇️ Redup (${lux} lx < min ${thr.min} lx) — Menaikan kecerahan...`;
        badge.className   = 'sni-status-badge badge-low';
    } else if (lux > thr.max) {
        badge.textContent = `⬆️ Terlalu terang (${lux} lx > max ${thr.max} lx) — Meredupkan...`;
        badge.className   = 'sni-status-badge badge-high';
    } else {
        badge.textContent = `✓ Dalam ambang SNI (${lux} lx) — Kecerahan dipertahankan`;
        badge.className   = 'sni-status-badge badge-ok';
    }

    // --- SNI bar visual (hanya tampil kalau ada threshold) ---
    const sniSection = document.getElementById('sni-range');
    const sniZone    = document.getElementById('sni-zone-ok');
    const sniMarker  = document.getElementById('sni-marker');
    const sniAxisMax = document.getElementById('sni-axis-max');

    if (thr) {
        const scale    = thr.max * 1.8;
        const zoneLeft = (thr.min / scale) * 100;
        const zoneW    = ((thr.max - thr.min) / scale) * 100;
        // Kalau lux 0 & lampu ON, marker di tengah-tengah area kiri agar terlihat
        const markerPct = isOn && lux === 0
            ? 2  // tempel di ujung kiri tapi tetap visible
            : Math.min((lux / scale) * 100, 99);

        sniSection.textContent  = `${thr.min} – ${thr.max} lx`;
        sniAxisMax.textContent  = `${Math.round(scale)} lx`;
        sniZone.style.left      = zoneLeft + '%';
        sniZone.style.width     = zoneW + '%';
        sniMarker.style.left    = markerPct + '%';
        sniMarker.style.display = 'block';
    } else {
        // Tidak ada threshold → sembunyikan bar, tampilkan pesan
        sniSection.textContent  = '–';
        sniAxisMax.textContent  = '–';
        sniZone.style.width     = '0';
        sniMarker.style.display = 'none';
    }

    // --- Sync mode buttons highlight ---
    document.querySelectorAll('.detail-mode-btn').forEach(btn => {
        btn.classList.toggle('mode-active', btn.dataset.mode === modeKey);
    });
}


// ==========================================
// POWER TOGGLE
// ==========================================
async function togglePower() {
    if (!currentDeviceId) return;
    const device = devices.find(d => d.id === currentDeviceId);
    if (!device) return;

    const newState = !device.is_on;
    // Optimistic update
    device.is_on = newState;
    updateDetailUI(device);

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${currentDeviceId}`, {
            method: 'PATCH',
            headers: HEADERS,
            body: JSON.stringify({ is_on: newState })
        });
        if (navigator.vibrate) navigator.vibrate(20);
    } catch (e) {
        // Rollback
        device.is_on = !newState;
        updateDetailUI(device);
        console.error(e);
    }
}

// ==========================================
// SWITCH MODE MODAL (Detail View)
// ==========================================
let selectedModeSwitch = null;

function openSwitchModal() {
    if (!currentDeviceId) return;
    const device = devices.find(d => d.id === currentDeviceId);
    const currentMode = device ? device.mode : null;
    selectedModeSwitch = currentMode;

    const grid = document.getElementById('switch-modes-grid');
    if (grid) {
        grid.innerHTML = MODES.map(m => `
            <button class="modal-mode-btn ${m.key === currentMode ? 'selected' : ''}"
                    data-mode="${m.key}"
                    id="switch-mode-${m.key}"
                    onclick="selectSwitchMode('${m.key}', this)">
                <span class="modal-mode-icon">${m.icon}</span>
                <span class="modal-mode-label">${m.label}</span>
            </button>
        `).join('');
    }

    const overlay = document.getElementById('switch-modal-overlay');
    const card    = document.getElementById('switch-modal-card');
    overlay.classList.add('active');
    requestAnimationFrame(() => card.classList.add('active'));
}

function selectSwitchMode(mode, el) {
    selectedModeSwitch = mode;
    document.querySelectorAll('#switch-modes-grid .modal-mode-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
}

function closeSwitchModal() {
    const card = document.getElementById('switch-modal-card');
    card.classList.remove('active');
    setTimeout(() => document.getElementById('switch-modal-overlay').classList.remove('active'), 300);
}

function closeSwitchModalOutside(e) {
    if (e.target === document.getElementById('switch-modal-overlay')) closeSwitchModal();
}

async function submitSwitchMode() {
    if (!currentDeviceId || !selectedModeSwitch) {
        closeSwitchModal();
        return;
    }
    const mode = selectedModeSwitch;
    const device = devices.find(d => d.id === currentDeviceId);
    if (device) device.mode = mode;

    closeSwitchModal();
    if (device) updateDetailUI(device);
    showToast('✅ Mode ruangan berhasil diubah!');

    try {
        await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${currentDeviceId}`, {
            method: 'PATCH',
            headers: HEADERS,
            body: JSON.stringify({ mode })
        });
        if (device) updateDetailUI(device);
    } catch (e) {
        console.error('switch mode error:', e);
        showToast('❌ Gagal mengubah mode di server.');
    }
}

// ==========================================
// LINE CHART (Chart.js)
// ==========================================
function initLuxChart() {
    const canvas = document.getElementById('lux-chart');
    if (luxChart) { luxChart.destroy(); luxChart = null; }

    luxChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Lux',
                    data: [],
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96,165,250,0.07)',
                    borderWidth: 2.5,
                    pointRadius: 3.5,
                    pointBackgroundColor: '#60a5fa',
                    pointBorderColor: 'transparent',
                    pointHoverRadius: 6,
                    tension: 0.45,
                    fill: true,
                },
                {
                    label: 'SNI Min',
                    data: [],
                    borderColor: 'rgba(251,191,36,0.65)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                },
                {
                    label: 'SNI Max',
                    data: [],
                    borderColor: 'rgba(239,68,68,0.55)',
                    borderWidth: 1.5,
                    borderDash: [5, 4],
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 350, easing: 'easeInOutQuart' },
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    ticks: {
                        color: '#475569',
                        font: { family: 'Outfit', size: 10 },
                        maxTicksLimit: 7,
                        maxRotation: 0,
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    border: { color: 'rgba(255,255,255,0.06)' }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#475569',
                        font: { family: 'Outfit', size: 10 },
                        callback: val => val + ' lx'
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    border: { color: 'rgba(255,255,255,0.06)' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(7,13,26,0.92)',
                    titleColor: '#64748b',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(96,165,250,0.25)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: ctx => {
                            if (ctx.datasetIndex === 0) return `  Lux: ${ctx.parsed.y} lx`;
                            if (ctx.datasetIndex === 1) return `  SNI Min: ${ctx.parsed.y} lx`;
                            return `  SNI Max: ${ctx.parsed.y} lx`;
                        }
                    }
                }
            }
        }
    });
}

async function refreshChart(deviceId) {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/device_logs?device_id=eq.${deviceId}&order=created_at.desc&limit=20`,
            { headers: HEADERS }
        );
        if (!res.ok || !luxChart) return;
        const logs = await res.json();

        const data = [...logs].reverse();
        const device = devices.find(d => d.id === deviceId);
        const thr    = device ? SNI_THRESHOLDS[device.mode] : null;
        const n      = data.length;

        document.getElementById('chart-count').textContent = `${n} data terakhir`;

        luxChart.data.labels                 = data.map(l => {
            const d = new Date(l.created_at);
            return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        });
        luxChart.data.datasets[0].data       = data.map(l => l.lux);
        luxChart.data.datasets[1].data       = thr ? Array(n).fill(thr.min) : [];
        luxChart.data.datasets[2].data       = thr ? Array(n).fill(thr.max) : [];

        if (thr && n > 0) {
            const maxLux = Math.max(...data.map(l => l.lux), thr.max);
            luxChart.options.scales.y.suggestedMax = Math.ceil(maxLux * 1.2);
        }

        luxChart.update('none');
    } catch (e) {
        console.error('chart refresh error:', e);
    }
}

// ==========================================
// NAVIGATION
// ==========================================
function goBack() {
    document.getElementById('view-detail').classList.remove('active');
    document.getElementById('view-home').classList.add('active');

    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = null;
    currentDeviceId = null;

    // Restart home refresh
    loadDevices();
    homeRefreshInterval = setInterval(loadDevices, 4000);
}

// ==========================================
// ADD DEVICE MODAL
// ==========================================
function renderModalModes() {
    const grid = document.getElementById('modal-modes-grid');
    grid.innerHTML = MODES.map(m => `
        <button class="modal-mode-btn"
                data-mode="${m.key}"
                id="modal-mode-${m.key}"
                onclick="selectModalMode('${m.key}', this)">
            <span class="modal-mode-icon">${m.icon}</span>
            <span class="modal-mode-label">${m.label}</span>
        </button>
    `).join('');
}

function selectModalMode(mode, el) {
    selectedModeModal = mode;
    document.querySelectorAll('.modal-mode-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
}

function openAddModal() {
    selectedModeModal = null;
    document.getElementById('input-device-id').value   = '';
    document.getElementById('input-device-name').value  = '';
    document.querySelectorAll('.modal-mode-btn').forEach(b => b.classList.remove('selected'));

    const overlay = document.getElementById('modal-overlay');
    const card    = document.getElementById('modal-card');
    overlay.classList.add('active');
    requestAnimationFrame(() => card.classList.add('active'));
    document.getElementById('input-device-id').focus();
}

function closeAddModal() {
    const card = document.getElementById('modal-card');
    card.classList.remove('active');
    setTimeout(() => document.getElementById('modal-overlay').classList.remove('active'), 300);
}

function closeModalOutside(e) {
    if (e.target === document.getElementById('modal-overlay')) closeAddModal();
}

async function submitAddDevice() {
    const deviceId   = document.getElementById('input-device-id').value.trim();
    const deviceName = document.getElementById('input-device-name').value.trim();
    const mode       = selectedModeModal;

    if (!deviceId)   { shakeInput('input-device-id');   return; }
    if (!deviceName) { shakeInput('input-device-name');  return; }
    if (!mode)       {
        document.getElementById('modal-modes-grid').classList.add('shake');
        setTimeout(() => document.getElementById('modal-modes-grid').classList.remove('shake'), 400);
        return;
    }

    const btn = document.getElementById('btn-submit-device');
    btn.disabled    = true;
    btn.textContent = 'Menyimpan...';

    try {
        // Gunakan upsert: jika Device ID sudah ada, update nama & mode-nya
        const upsertHeaders = {
            ...HEADERS,
            "Prefer": "return=representation,resolution=merge-duplicates"
        };
        const res = await fetch(`${SUPABASE_URL}/rest/v1/devices`, {
            method: 'POST',
            headers: upsertHeaders,
            body: JSON.stringify({
                id: deviceId,
                name: deviceName,
                mode: mode,
                is_on: true,
                current_brightness: 0,
                current_lux: 0,
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${res.status}`);
        }
        closeAddModal();
        await loadDevices();
        showToast('✅ Device berhasil ditambahkan!');
    } catch (e) {
        // Tampilkan error di dalam modal (bukan alert)
        let errMsg = e.message || 'Terjadi kesalahan';
        const existing = document.getElementById('modal-error-msg');
        if (existing) existing.remove();
        const errEl = document.createElement('p');
        errEl.id = 'modal-error-msg';
        errEl.style.cssText = 'color:#f87171;font-size:12px;text-align:center;margin-top:-8px;';
        errEl.textContent = '⚠️ ' + errMsg;
        document.querySelector('.modal-footer').before(errEl);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Tambahkan';
    }
}

function shakeInput(id) {
    const el = document.getElementById(id);
    el.classList.add('shake');
    el.focus();
    setTimeout(() => el.classList.remove('shake'), 400);
}

// ==========================================
// TOAST NOTIFICATION
// ==========================================
function showToast(msg, duration = 3000) {
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.textContent = msg;
    toast.style.cssText = [
        'position:fixed',
        'bottom:32px',
        'left:50%',
        'transform:translateX(-50%) translateY(20px)',
        'background:rgba(15,23,42,0.95)',
        'border:1px solid rgba(255,255,255,0.12)',
        'border-radius:12px',
        'padding:12px 20px',
        'color:#e2e8f0',
        'font-size:13px',
        'font-weight:500',
        'font-family:Outfit,sans-serif',
        'z-index:999',
        'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
        'opacity:0',
        'transition:all 0.3s cubic-bezier(0.4,0,0.2,1)',
        'white-space:nowrap',
        'pointer-events:none'
    ].join(';');
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==========================================
// START

// ==========================================
initApp();