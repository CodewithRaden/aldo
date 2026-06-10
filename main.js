// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://vfjwilyvjslgfkerobxw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmandpbHl2anNsZ2ZrZXJvYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzYzOTYsImV4cCI6MjA5NjY1MjM5Nn0.FDe7rCu5BO3CVhAGJUKjvWyEreWYsOPDcreSOpeuCv4";

// Initialize Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
const DEVICE_ID = 'lampu_1';

// ==========================================
// INITIAL DATA FETCH & SUBSCRIPTIONS
// ==========================================
async function initApp() {
    try {
        // 1. Fetch initial device state
        const { data: device, error } = await supabase
            .from('devices')
            .select('*')
            .eq('id', DEVICE_ID)
            .single();
            
        if (error) throw error;
            
        if (device) {
            handleDeviceUpdate(device);
        }

        // 2. Fetch initial logs
        fetchLogs();

        // 3. Subscribe to Realtime Device Changes
        supabase
            .channel('device-changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${DEVICE_ID}` }, payload => {
                handleDeviceUpdate(payload.new);
            })
            .subscribe((status, err) => {
                if (err) console.error("Realtime err:", err);
            });

        // 4. Subscribe to Realtime Log Changes
        supabase
            .channel('log-changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'device_logs', filter: `device_id=eq.${DEVICE_ID}` }, payload => {
                fetchLogs();
            })
            .subscribe();
            
    } catch (e) {
        console.error("Init Error:", e);
        alert("Gagal terhubung ke Supabase. Pesan Error: " + e.message);
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

async function fetchLogs() {
    const { data: logs, error } = await supabase
        .from('device_logs')
        .select('*')
        .eq('device_id', DEVICE_ID)
        .order('created_at', { ascending: false })
        .limit(15);
        
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
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// Mode Buttons
modeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const selectedMode = btn.dataset.mode;
        if (navigator.vibrate) navigator.vibrate(50);
        
        await supabase
            .from('devices')
            .update({ mode: selectedMode })
            .eq('id', DEVICE_ID);
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
    
    await supabase
        .from('devices')
        .update({ manual_brightness: value })
        .eq('id', DEVICE_ID);
        
    isUpdatingSlider = false;
});

// Run Init
initApp();
