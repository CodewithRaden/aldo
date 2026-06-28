// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://vfjwilyvjslgfkerobxw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmandpbHl2anNsZ2ZrZXJvYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzYzOTYsImV4cCI6MjA5NjY1MjM5Nn0.FDe7rCu5BO3CVhAGJUKjvWyEreWYsOPDcreSOpeuCv4";

const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
};

// ==========================================
// GLOBAL STATES
// ==========================================
let isUpdatingSlider1 = false;
let isUpdatingSlider2 = false;

// ==========================================
// MODE LABELS (Bahasa Indonesia)
// ==========================================
const MODE_LABELS = {
    ruang_tidur:  "Ruang Tidur 🛏️",
    ruang_tamu:   "Ruang Tamu 🛋️",
    ruang_makan:  "Ruang Makan 🍽️",
    ruang_kerja:  "Ruang Kerja 💻",
    manual:       "Manual 🎚️",
    ruang_dapur:  "Dapur 🍳",
    ruang_teras:  "Teras 🏡",
    kamar_mandi:  "Kamar Mandi 🚿",
    manual_2:     "Manual 🎚️",
    off:          "Mati ⚫"
};

// Mode → badge CSS class
const MODE_BADGE_CLASS = {
    ruang_tidur:  "badge-tidur",
    ruang_tamu:   "badge-tamu",
    ruang_makan:  "badge-makan",
    ruang_kerja:  "badge-kerja",
    manual:       "badge-manual",
    manual_2:     "badge-manual",
    ruang_dapur:  "badge-dapur",
    ruang_teras:  "badge-teras",
    kamar_mandi:  "badge-mandi",
    off:          "badge-off"
};

// ==========================================
// INITIALIZATION
// ==========================================
async function initApp() {
    try {
        await fetchAllData();
        // Polling every 2 seconds
        setInterval(async () => {
            try {
                await fetchAllData();
            } catch(e) {
                console.error("Polling error:", e);
            }
        }, 2000);
    } catch (e) {
        showError("Gagal Inisialisasi: " + e.message);
    }
}

async function fetchAllData() {
    await Promise.all([
        fetchDeviceData('lampu_1'),
        fetchDeviceData('lampu_2'),
        fetchLogsData('lampu_1', 'logs-list-1', 'log-count-1'),
        fetchLogsData('lampu_2', 'logs-list-2', 'log-count-2'),
    ]);
}

// ==========================================
// TAB SWITCHER
// ==========================================
function switchLamp(lampId, btnEl) {
    document.querySelectorAll('.lamp-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`panel-${lampId}`).classList.add('active');
    (btnEl || document.getElementById(`tab-${lampId}`)).classList.add('active');
}

// ==========================================
// FETCH DEVICE STATE
// ==========================================
async function fetchDeviceData(id) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${id}`, {
        method: 'GET',
        headers: headers
    });
    if (!response.ok) throw new Error(`Gagal mengambil data ${id}`);
    const data = await response.json();
    if (data && data.length > 0) {
        handleDeviceUpdate(id, data[0]);
    }
}

// ==========================================
// FETCH LOGS
// ==========================================
async function fetchLogsData(id, listElementId, countElementId) {
    try {
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/device_logs?device_id=eq.${id}&order=created_at.desc&limit=15`,
            { method: 'GET', headers: headers }
        );
        if (!response.ok) throw new Error(`Gagal mengambil histori ${id}`);
        const logs = await response.json();

        const logsList  = document.getElementById(listElementId);
        const countBadge = document.getElementById(countElementId);
        if (!logsList) return;

        logsList.innerHTML = '';
        if (!logs || logs.length === 0) {
            logsList.innerHTML = '<div class="log-placeholder">Belum ada riwayat</div>';
            if (countBadge) countBadge.textContent = '0 log';
            return;
        }

        if (countBadge) countBadge.textContent = `${logs.length} log`;

        logs.forEach((log) => {
            const logItem = document.createElement('div');
            logItem.className = 'log-item';

            const modeKey  = log.mode || 'default';
            const modeLabel = (MODE_LABELS[modeKey] || modeKey.replace(/_/g, ' ').toUpperCase());
            const badgeCls  = MODE_BADGE_CLASS[modeKey] || 'badge-default';

            const dateObj    = new Date(log.created_at);
            const timeString = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateString = dateObj.toLocaleDateString('id-ID');

            logItem.innerHTML = `
                <div class="log-top">
                    <span class="log-time">${dateString} ${timeString}</span>
                    <span class="log-mode-badge ${badgeCls}">${modeLabel}</span>
                </div>
                <div class="log-details">
                    <span>Lux: <strong>${log.lux}</strong></span>
                    <span>Brightness: <strong>${log.brightness}%</strong></span>
                </div>
            `;
            logsList.appendChild(logItem);
        });
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// DATA HANDLER — updates all UI elements
// ==========================================
function handleDeviceUpdate(id, device) {
    const suffix = id === 'lampu_1' ? '1' : '2';
    const isManual = device.mode === 'manual' || device.mode === 'manual_2';
    const brightness = device.current_brightness ?? 0;
    const isOff = (device.mode === 'off' || brightness === 0);

    // --- Mode Buttons ---
    document.querySelectorAll(`.btn-${id}`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === device.mode);
    });

    // --- Slider ---
    const sliderContainer = document.getElementById(`slider-container-${suffix}`);
    const brightnessSlider = document.getElementById(`brightness-slider-${suffix}`);
    const sliderDisplay    = document.getElementById(`slider-display-${suffix}`);

    if (isManual) {
        sliderContainer.classList.add('active');
        brightnessSlider.disabled = false;
        const isUpdating = id === 'lampu_1' ? isUpdatingSlider1 : isUpdatingSlider2;
        if (!isUpdating) {
            brightnessSlider.value = device.manual_brightness;
            brightnessSlider.style.setProperty('--value', device.manual_brightness + '%');
            if (sliderDisplay) sliderDisplay.textContent = device.manual_brightness + '%';
        }
    } else {
        sliderContainer.classList.remove('active');
        brightnessSlider.disabled = true;
    }

    // --- Ring Gauge ---
    updateRingGauge(suffix, brightness);

    // --- Brightness Value (with pulse) ---
    const valBrightness = document.getElementById(`val-brightness-${suffix}`);
    if (valBrightness && valBrightness.textContent !== brightness + '%') {
        valBrightness.textContent = brightness + '%';
        valBrightness.classList.remove('pulse');
        void valBrightness.offsetWidth;
        valBrightness.classList.add('pulse');
    }

    // --- Lux ---
    const valLux = document.getElementById(`val-lux-${suffix}`);
    if (valLux) valLux.textContent = device.current_lux ?? 0;

    // --- Lamp Glow + Status Label ---
    updateLampGlow(suffix, brightness);

    // --- Active Mode Label ---
    updateModeLabel(suffix, device.mode);
}

// ==========================================
// RING GAUGE UPDATE
// ==========================================
function updateRingGauge(suffix, brightness) {
    const ringFill = document.getElementById(`ring-fill-${suffix}`);
    if (!ringFill) return;
    const circumference = 314; // 2 * π * 50
    const offset = circumference - (brightness / 100) * circumference;
    ringFill.style.strokeDashoffset = offset;
}

// ==========================================
// LAMP GLOW UPDATE
// ==========================================
function updateLampGlow(suffix, brightness) {
    const bulb  = document.getElementById(`bulb-${suffix}`);
    const label = document.getElementById(`bulb-label-${suffix}`);
    if (!bulb || !label) return;

    bulb.classList.remove('glow-low', 'glow-mid', 'glow-high');
    label.classList.remove('off', 'dim', 'bright');

    if (brightness === 0) {
        label.textContent = 'OFF';
        label.classList.add('off');
    } else if (brightness <= 35) {
        bulb.classList.add('glow-low');
        label.textContent = 'DIM';
        label.classList.add('dim');
    } else if (brightness <= 70) {
        bulb.classList.add('glow-mid');
        label.textContent = 'ON';
        label.classList.add('dim');
    } else {
        bulb.classList.add('glow-high');
        label.textContent = 'BRIGHT';
        label.classList.add('bright');
    }
}

// ==========================================
// ACTIVE MODE LABEL UPDATE
// ==========================================
function updateModeLabel(suffix, mode) {
    const labelEl = document.getElementById(`active-mode-label-${suffix}`);
    if (labelEl) {
        labelEl.textContent = MODE_LABELS[mode] || mode?.replace(/_/g, ' ') || '–';
    }
}

// ==========================================
// EVENT LISTENERS Setup — Mode Buttons
// ==========================================
function setupModeButtons(id) {
    document.querySelectorAll(`.btn-${id}`).forEach(btn => {
        btn.addEventListener('click', async () => {
            const selectedMode = btn.dataset.mode;
            if (navigator.vibrate) navigator.vibrate([10, 20, 10]);

            // Optimistic UI update
            document.querySelectorAll(`.btn-${id}`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            try {
                await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: headers,
                    body: JSON.stringify({ mode: selectedMode })
                });
                await fetchDeviceData(id);
            } catch (e) {
                showError(`Gagal mengubah mode ${id}.`);
            }
        });
    });
}

// ==========================================
// EVENT LISTENERS Setup — Slider
// ==========================================
function setupSliderEvents(id, suffix) {
    const slider       = document.getElementById(`brightness-slider-${suffix}`);
    const sliderDisplay = document.getElementById(`slider-display-${suffix}`);
    const valBrightness = document.getElementById(`val-brightness-${suffix}`);

    slider.addEventListener('input', (e) => {
        if (id === 'lampu_1') isUpdatingSlider1 = true;
        else isUpdatingSlider2 = true;

        const value = e.target.value;
        if (navigator.vibrate && value % 10 === 0) navigator.vibrate(5);
        slider.style.setProperty('--value', value + '%');
        if (sliderDisplay) sliderDisplay.textContent = value + '%';
        if (valBrightness) valBrightness.textContent = value + '%';

        // Live ring + glow update while dragging
        updateRingGauge(suffix, parseInt(value));
        updateLampGlow(suffix, parseInt(value));
    });

    slider.addEventListener('change', async (e) => {
        const value = parseInt(e.target.value);
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${id}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({ manual_brightness: value })
            });
            if (id === 'lampu_1') isUpdatingSlider1 = false;
            else isUpdatingSlider2 = false;
            await fetchDeviceData(id);
        } catch (e) {
            showError(`Gagal mengubah kecerahan ${id}.`);
        }
    });
}

// ==========================================
// ERROR DISPLAY
// ==========================================
function showError(msg) {
    const errBox = document.getElementById('error-box');
    if (errBox) {
        errBox.style.display = 'block';
        errBox.innerHTML += `<strong>Notice:</strong> ${msg}<br>`;
    }
}

// ==========================================
// INIT
// ==========================================
setupModeButtons('lampu_1');
setupModeButtons('lampu_2');
setupSliderEvents('lampu_1', '1');
setupSliderEvents('lampu_2', '2');

initApp();