#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "rbdimmerESP32.h"

// =====================================
// WIFI
// =====================================
const char* ssid = "Gyo";
const char* password = "qwertyuiop";

// =====================================
// SUPABASE
// =====================================
const char* SUPABASE_URL = "https://vfjwilyvjslgfkerobxw.supabase.co";
const char* SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmandpbHl2anNsZ2ZrZXJvYnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzYzOTYsImV4cCI6MjA5NjY1MjM5Nn0.FDe7rCu5BO3CVhAGJUKjvWyEreWYsOPDcreSOpeuCv4";

const char* DEVICE_ID = "lampu_1";

// =====================================
// DIMMER
// =====================================
#define ZERO_CROSS_PIN 34
#define DIMMER_PIN 23
#define PHASE_NUM 0

rbdimmer_channel_t* dimmer = NULL;

// =====================================
// VARIABLE
// =====================================
String currentMode = "";
unsigned long lastRead = 0;
int lastManualBrightness = -1;

WiFiClientSecure client;

// =====================================
// CONNECT WIFI
// =====================================
void connectWiFi()
{
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");
  Serial.print("IP : ");
  Serial.println(WiFi.localIP());

  client.setInsecure(); // Supabase uses HTTPS, allow insecure connection to avoid cert management
}

// =====================================
// LOG TO SUPABASE
// =====================================
void logToSupabase(String mode, int brightness, int lux)
{
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_logs";
  http.begin(client, url);

  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  // Create JSON
  StaticJsonDocument<200> doc;
  doc["device_id"] = DEVICE_ID;
  doc["mode"] = mode;
  doc["brightness"] = brightness;
  doc["lux"] = lux;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    Serial.print("Log disimpan, Code: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("Error log: ");
    Serial.println(http.errorToString(httpResponseCode));
  }

  http.end();
}

// =====================================
// UPDATE STATUS TO SUPABASE
// =====================================
void updateStatusToSupabase(int brightness, int lux)
{
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
  doc["current_lux"] = lux;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpResponseCode = http.PATCH(requestBody);

  if (httpResponseCode > 0) {
    Serial.println("Status berhasil diupdate!");
  } else {
    Serial.print("Error update status: ");
    Serial.println(http.errorToString(httpResponseCode));
  }

  http.end();
}

// =====================================
// APPLY MODE
// =====================================
void applyMode(String mode, int manualBrightnessValue = -1)
{
  int brightness = 0;
  int lux = 0;

  if(mode == "ruang_tidur") { brightness = 5; lux = 120; }
  else if(mode == "ruang_tamu") { brightness = 15; lux = 140; }
  else if(mode == "ruang_makan") { brightness = 30; lux = 200; }
  else if(mode == "ruang_kerja") { brightness = 60; lux = 240; }
  else if(mode == "manual") {
    if (manualBrightnessValue != -1) {
      brightness = manualBrightnessValue;
      // Simulasi nilai Lux berdasarkan persentase kecerahan agar tidak 0
      if (brightness == 0) {
        lux = 0;
      } else {
        lux = 100 + (brightness * 2); 
      }
    } else {
      return; // Do nothing if brightness is not passed properly
    }
  }
  else {
    Serial.println("Mode tidak dikenal");
    return;
  }

  // =====================================
  // CHANGE DIMMER
  // =====================================
  rbdimmer_set_level(dimmer, brightness);
  delay(500);

  // =====================================
  // UPDATE FIREBASE / SUPABASE
  // =====================================
  updateStatusToSupabase(brightness, lux);
  logToSupabase(mode, brightness, lux);

  // =====================================
  // SERIAL MONITOR
  // =====================================
  Serial.println("======================");
  Serial.print("MODE : "); Serial.println(mode);
  Serial.print("BRIGHTNESS : "); Serial.print(brightness); Serial.println("%");
  Serial.print("LUX : "); Serial.println(lux);
  Serial.println("======================");
}

// =====================================
// SETUP
// =====================================
void setup()
{
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n--- ESP32 MEMULAI (SUPABASE VERSION) ---");

  connectWiFi();

  // =====================================
  // DIMMER INIT
  // =====================================
  if(rbdimmer_init() != RBDIMMER_OK) {
    Serial.println("Dimmer Error");
    while(1);
  }

  if(rbdimmer_register_zero_cross(ZERO_CROSS_PIN, PHASE_NUM, 0) != RBDIMMER_OK) {
    Serial.println("Zero Cross Error");
    while(1);
  }

  rbdimmer_config_t dimmerConfig = {
    .gpio_pin = DIMMER_PIN,
    .phase = PHASE_NUM,
    .initial_level = 0,
    .curve_type = RBDIMMER_CURVE_RMS
  };

  if(rbdimmer_create_channel(&dimmerConfig, &dimmer) != RBDIMMER_OK) {
    Serial.println("Channel Error");
    while(1);
  }

  rbdimmer_set_level(dimmer, 0);
  Serial.println("System Ready - Listening to Supabase");
}

// =====================================
// LOOP
// =====================================
void loop()
{
  if(WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Poll Supabase every 1.5 seconds
  if(millis() - lastRead > 1500)
  {
    lastRead = millis();

    HTTPClient http;
    String url = String(SUPABASE_URL) + "/rest/v1/devices?id=eq." + DEVICE_ID + "&select=mode,manual_brightness";
    http.begin(client, url);
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);

    int httpResponseCode = http.GET();

    if (httpResponseCode > 0) {
      String payload = http.getString();
      
      // Parse JSON payload (which is an array, e.g. [{"mode":"ruang_tamu","manual_brightness":50}])
      StaticJsonDocument<256> doc;
      DeserializationError error = deserializeJson(doc, payload);

      if (!error && doc.size() > 0) {
        String mode = doc[0]["mode"].as<String>();
        int manualBrightness = doc[0]["manual_brightness"].as<int>();

        bool modeChanged = (mode != currentMode);
        bool manualChanged = (mode == "manual" && manualBrightness != lastManualBrightness);

        if(modeChanged) {
          currentMode = mode;
          Serial.println("Mode Baru : " + mode);
          if (mode != "manual") {
            lastManualBrightness = -1; 
            applyMode(mode);
          }
        }

        if(manualChanged) {
          lastManualBrightness = manualBrightness;
          Serial.print("Set Manual Brightness : ");
          Serial.println(manualBrightness);
          applyMode("manual", manualBrightness);
        }
      }
    } else {
      Serial.print("Supabase Read Failed: ");
      Serial.println(http.errorToString(httpResponseCode));
    }
    
    http.end();
  }
}
