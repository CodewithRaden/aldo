// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://vfjwilyvjslgfkerobxw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmandpbHl2anNsZ2ZrZXJvYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzYzOTYsImV4cCI6MjA5NjY1MjM5Nn0.FDe7rCu5BO3CVhAGJUKjvWyEreWYsOPDcreSOpeuCv4";
const DEVICE_ID = 'lampu_1';

const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const valBrightness = document.getElementById('val-brightness');
const valLux = document.getElementById('val-lux');
const modeBtns = document.querySelectorAll('.mode-btn');
const sliderContainer = document.getElementById('manual-slider-container');
const brightnessSlider = document.getElementById('brightness-slider');
const logsList = document.getElementById('logs-list');

// ==========================================
// GLOBAL STATE
// ==========================================
let currentMode = "";
let isUpdatingSlider = false;

// ==========================================
// INITIALIZATION
// ==========================================
async function initApp() {
    try {
        await fetchDeviceData();
        await fetchLogsData();
        
        // Polling as fallback instead of websocket
        setInterval(fetchDeviceData, 2000);
        setInterval(fetchLogsData, 5000);
    } catch (e) {
        showError("Gagal Inisialisasi: " + e.message);
    }
}

// ==========================================
// FETCH DEVICE STATE
// ==========================================
async function fetchDeviceData() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${DEVICE_ID}`, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) throw new Error("Gagal mengambil data perangkat.");
        
        const data = await response.json();
        if (data && data.length > 0) {
            handleDeviceUpdate(data[0]);
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// FETCH LOGS
// ==========================================
async function fetchLogsData() {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/device_logs?device_id=eq.${DEVICE_ID}&order=created_at.desc&limit=15`, {
            method: 'GET',
            headers: headers
        });
        
        if (!response.ok) throw new Error("Gagal mengambil histori.");
        
        const logs = await response.json();
        
        logsList.innerHTML = '';
        if (!logs || logs.length === 0) {
            logsList.innerHTML = '<div class="log-placeholder">Belum ada riwayat</div>';
            return;
        }

        logs.forEach((log) => {
            const logItem = document.createElement('div');
            logItem.className = 'log-item';
            
            let formattedMode = log.mode.replace('_', ' ').toUpperCase();
            
            // Format Time
            const dateObj = new Date(log.created_at);
            const timeString = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateString = dateObj.toLocaleDateString('id-ID');

            logItem.innerHTML = `
                <div class="log-time">${dateString} ${timeString}</div>
                <div class="log-details">
                    <span>Mode: <strong>${formattedMode}</strong></span>
                    <span>Lux: <strong>${log.lux}</strong> (${log.brightness}%)</span>
                </div>
            `;
            logsList.appendChild(logItem);
        });
    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// DATA HANDLERS
// ==========================================
function handleDeviceUpdate(device) {
    currentMode = device.mode;
    
    // Update Mode UI
    modeBtns.forEach(btn => {
        if (btn.dataset.mode === currentMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update Manual UI
    if (currentMode === 'manual') {
        sliderContainer.classList.add('active');
        brightnessSlider.disabled = false;
        
        if (!isUpdatingSlider) {
            brightnessSlider.value = device.manual_brightness;
            brightnessSlider.style.setProperty('--value', device.manual_brightness + '%');
        }
    } else {
        sliderContainer.classList.remove('active');
        brightnessSlider.disabled = true;
    }
    
    // Update Status display
    valBrightness.innerText = device.current_brightness + '%';
    valLux.innerText = device.current_lux;
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// Mode Buttons
modeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const selectedMode = btn.dataset.mode;
        if (navigator.vibrate) navigator.vibrate(50);
        
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${DEVICE_ID}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({ mode: selectedMode })
            });
            fetchDeviceData(); // Langsung update UI
        } catch (e) {
            showError("Gagal mengubah mode.");
        }
    });
});

// Slider Input (While dragging)
brightnessSlider.addEventListener('input', (e) => {
    isUpdatingSlider = true;
    const value = e.target.value;
    
    brightnessSlider.style.setProperty('--value', value + '%');
    valBrightness.innerText = value + '%';
});

// Slider Change (When mouse is released)
brightnessSlider.addEventListener('change', async (e) => {
    const value = parseInt(e.target.value);
    
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/devices?id=eq.${DEVICE_ID}`, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({ manual_brightness: value })
        });
        isUpdatingSlider = false;
        fetchDeviceData();
    } catch (e) {
        showError("Gagal mengubah kecerahan.");
    }
});

function showError(msg) {
    const errBox = document.getElementById('error-box');
    if(errBox) {
        errBox.style.display = 'block';
        errBox.innerHTML += `<strong>Notice:</strong> ${msg}<br>`;
    }
}

// Run Init
initApp();
