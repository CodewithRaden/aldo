#include <Wire.h>
#include <BH1750.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "rbdimmerESP32.h"

// =====================================
// WIFI
// =====================================
const char* ssid     = "Gyo";
const char* password = "qwertyuiop";

// =====================================
// SUPABASE
// =====================================
const char* SUPABASE_URL = "https://vfjwilyvjslgfkerobxw.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmandpbHl2anNsZ2ZrZXJvYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzYzOTYsImV4cCI6MjA5NjY1MjM5Nn0.FDe7rCu5BO3CVhAGJUKjvWyEreWYsOPDcreSOpeuCv4";

// ===================================================
// DEVICE ID — Sesuaikan dengan ID di Supabase / App
// ===================================================
const char* DEVICE_ID = "lampu_1";

// =====================================
// DIMMER
// =====================================
#define ZERO_CROSS_PIN 34
#define DIMMER_PIN     23
#define PHASE_NUM       0

rbdimmer_channel_t* dimmer = NULL;

// =====================================
// BH1750 SENSOR
// Wiring: SDA→GPIO21, SCL→GPIO22, ADDR→GND (0x23)
// =====================================
#define SDA_PIN 21
#define SCL_PIN 22

BH1750 lightMeter(0x23); // ADDR ke GND = alamat 0x23

// =====================================
// SNI 03-6197-2000 — AMBANG BATAS LUX
// Nilai sesuai SNI 03-6197-2000 Tabel 1 Rumah Tinggal
// =====================================
int getMinLux(String mode) {
  if (mode == "ruang_tamu")  return 120;
  if (mode == "ruang_makan") return 120;
  if (mode == "ruang_kerja") return 120;
  if (mode == "ruang_tidur") return 120;
  if (mode == "kamar_mandi") return 250;
  if (mode == "dapur")       return 250;
  if (mode == "teras")       return 60;
  if (mode == "garasi")      return 60;
  return 100; // default
}

int getMaxLux(String mode) {
  if (mode == "ruang_tamu")  return 150;
  if (mode == "ruang_makan") return 250;
  if (mode == "ruang_kerja") return 250;
  if (mode == "ruang_tidur") return 250;
  if (mode == "kamar_mandi") return 500;
  if (mode == "dapur")       return 500;
  if (mode == "teras")       return 120;
  if (mode == "garasi")      return 120;
  return 300; // default
}

// =====================================
// VARIABEL GLOBAL
// =====================================
String  currentMode    = "";
bool    currentIsOn    = true;
int     currentBright  = 0;  // 0–100 %
unsigned long lastRead = 0;

WiFiClientSecure client;

// =====================================
// CONNECT WIFI
// =====================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("WiFi Connected");
  Serial.print("IP : ");
  Serial.println(WiFi.localIP());
  client.setInsecure();
}

// =====================================
// LOG KE SUPABASE (device_logs)
// =====================================
void logToSupabase(String mode, int brightness, int lux) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_logs";
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  StaticJsonDocument<200> doc;
  doc["device_id"]  = DEVICE_ID;
  doc["mode"]       = mode;
  doc["brightness"] = brightness;
  doc["lux"]        = lux;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code > 0) {
    Serial.print("Log OK: "); Serial.println(code);
  } else {
    Serial.print("Log Error: "); Serial.println(http.errorToString(code));
  }
  http.end();
}

// =====================================
// UPDATE STATUS KE SUPABASE (devices)
// =====================================
void updateStatusToSupabase(int brightness, int lux) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/devices?id=eq." + DEVICE_ID;
  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  StaticJsonDocument<100> doc;
  doc["current_brightness"] = brightness;
  doc["current_lux"]        = lux;

  String body;
  serializeJson(doc, body);

  int code = http.PATCH(body);
  if (code > 0) {
    Serial.println("Status updated OK");
  } else {
    Serial.print("Update Error: "); Serial.println(http.errorToString(code));
  }
  http.end();
}

// =====================================
// SETUP
// =====================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n--- SmartLamp ESP32 + BH1750 + SNI ---");

  // ---- BH1750 Init ----
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("ERROR: BH1750 tidak terdeteksi! Periksa wiring:");
    Serial.println("  SDA -> GPIO21 | SCL -> GPIO22 | ADDR -> GND");
    while (1);
  }
  Serial.println("BH1750 OK (alamat 0x23)");

  // ---- WiFi ----
  connectWiFi();

  // ---- Dimmer Init ----
  if (rbdimmer_init() != RBDIMMER_OK) {
    Serial.println("ERROR: Dimmer init gagal");
    while (1);
  }
  if (rbdimmer_register_zero_cross(ZERO_CROSS_PIN, PHASE_NUM, 0) != RBDIMMER_OK) {
    Serial.println("ERROR: Zero Cross init gagal");
    while (1);
  }

  rbdimmer_config_t dimmerConfig = {
    .gpio_pin    = DIMMER_PIN,
    .phase       = PHASE_NUM,
    .initial_level = 0,
    .curve_type  = RBDIMMER_CURVE_RMS
  };
  if (rbdimmer_create_channel(&dimmerConfig, &dimmer) != RBDIMMER_OK) {
    Serial.println("ERROR: Dimmer channel gagal");
    while (1);
  }

  rbdimmer_set_level(dimmer, 0);
  Serial.println("System Ready — Polling Supabase...");
}

// =====================================
// LOOP
// =====================================
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Poll setiap 1.5 detik
  if (millis() - lastRead > 1500) {
    lastRead = millis();

    // ---- 1. Baca Lux dari BH1750 ----
    float luxRaw = lightMeter.readLightLevel();
    if (luxRaw < 0) luxRaw = 0;
    int lux = (int)luxRaw;

    // ---- 2. Ambil mode & is_on dari Supabase ----
    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/devices?id=eq." + DEVICE_ID + "&select=mode,is_on";
    http.begin(client, url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

    int httpCode = http.GET();

    if (httpCode > 0) {
      String payload = http.getString();

      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, payload);

      if (!err && doc.size() > 0) {
        String mode  = doc[0]["mode"].as<String>();
        bool   is_on = doc[0]["is_on"].as<bool>();

        currentMode  = mode;
        currentIsOn  = is_on;

        // ---- 3. Logika Kontrol ----
        if (!is_on) {
          // ---- LAMPU OFF ----
          currentBright = 0;
          rbdimmer_set_level(dimmer, 0);

        } else {
          // ---- AUTO KONTROL berbasis SNI ----
          int minLux = getMinLux(mode);
          int maxLux = getMaxLux(mode);

          if (lux < minLux) {
            // Ruangan terlalu redup → tambah kecerahan
            currentBright = min(100, currentBright + 5);
          } else if (lux > maxLux) {
            // Ruangan terlalu terang → kurangi kecerahan
            currentBright = max(0, currentBright - 5);
          }
          // else: lux dalam ambang SNI → tahan (tidak berubah)

          rbdimmer_set_level(dimmer, currentBright);
        }

        // ---- 4. Update status + Log ke Supabase ----
        updateStatusToSupabase(currentBright, lux);
        logToSupabase(mode, currentBright, lux);

        // ---- 5. Serial Monitor ----
        int minLux = getMinLux(mode);
        int maxLux = getMaxLux(mode);
        Serial.println("==============================");
        Serial.print("DEVICE : "); Serial.println(DEVICE_ID);
        Serial.print("MODE   : "); Serial.println(mode);
        Serial.print("IS ON  : "); Serial.println(is_on ? "YES" : "NO");
        Serial.print("LUX    : "); Serial.print(lux);    Serial.println(" lx");
        Serial.print("BRIGHT : "); Serial.print(currentBright); Serial.println(" %");
        Serial.print("SNI MIN: "); Serial.print(minLux); Serial.println(" lx");
        Serial.print("SNI MAX: "); Serial.print(maxLux); Serial.println(" lx");
        if (!is_on)             Serial.println("STATUS : LAMPU OFF");
        else if (lux < minLux)  Serial.println("STATUS : REDUP  -> NAIKKAN TERANG");
        else if (lux > maxLux)  Serial.println("STATUS : TERANG -> REDUPKAN");
        else                    Serial.println("STATUS : DALAM AMBANG SNI - HOLD");
        Serial.println("==============================");

      } else {
        Serial.println("Parse JSON gagal atau data kosong");
      }
    } else {
      Serial.print("Supabase Read Failed: ");
      Serial.println(http.errorToString(httpCode));
    }
    http.end();
  }
}