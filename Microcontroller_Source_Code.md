// ESP32 version with SIM700G (Serial2) + PZEM (Serial1) + TinyGPS++

// Libraries required:

//   - PZEM004Tv30

//   - LiquidCrystal\_I2C

//   - TinyGPSPlus

//   - WiFi

//   - HTTPClient

//   - ArduinoJson



\#include <PZEM004Tv30.h>

\#include <Wire.h>

\#include <LiquidCrystal\_I2C.h>

\#include <TinyGPS++.h>

\#include <WiFi.h>

\#include <HTTPClient.h>

\#include <WiFiClientSecure.h>

\#include <ArduinoJson.h>



// ----------------- User config -----------------

const char\* ssid = "Esu";

const char\* password = "148200567";



const char\* firebase\_url = "https://kesb-demo---shield-default-rtdb.firebaseio.com/pzem.json";

// ------------------------------------------------



// ---------- LCD ----------

LiquidCrystal\_I2C lcd(0x27, 16, 2);



// ---------- Buzzer ----------

\#define BUZZER\_PIN 2   // change if needed

float highPowerThreshold = 100.0; // Watts threshold for unauthorized use



// ---------- UART / Pin assignment (change to your wiring) ----------

// Note: ESP32 has 3 hardware UARTs: Serial (USB), Serial1, Serial2

// We'll use:

//   Serial  -> USB debug

//   Serial1 -> PZEM       (RX1, TX1)

//   Serial2 -> SIM700G    (RX2, TX2)   \[also provides GPS NMEA]

// Adjust pins if required by your board



\#define PZEM\_RX\_PIN 16  // ESP32 GPIO for RX1 (connect to PZEM TX)

\#define PZEM\_TX\_PIN 17  // ESP32 GPIO for TX1 (connect to PZEM RX)



\#define SIM\_RX\_PIN 27   // ESP32 GPIO for RX2 (connect to SIM700G TX)

\#define SIM\_TX\_PIN 26   // ESP32 GPIO for TX2 (connect to SIM700G RX)



// ---------- HardwareSerial instances ----------

HardwareSerial SerialPZEM(1);   // Serial1

HardwareSerial SerialSIM(2);    // Serial2



PZEM004Tv30 pzem(\&SerialPZEM);



// ---------- GPS parser (reads NMEA from SIM700G) ----------

TinyGPSPlus gps;



// ---------- Secure client ----------

WiFiClientSecure secureClient;



// ---------- Helper flags ----------

bool wifiConnected = false;

unsigned long lastFirebaseMillis = 0;

const unsigned long FIREBASE\_INTERVAL = 5000; // 5s (adjust as needed)



// ---------- Forward declarations ----------

void sim700Init();

bool sim700SendSMS(const char\* number, const char\* message);

void publishToFirebase(float voltage, float current, float power, float energy, float freq, float pf, const char\* alert, double lat, double lon);

void readAndParseSIMGPS();

void showOnLCD(float voltage, float current, float power, float freq);



// ---------------- setup ----------------

void setup() {

&nbsp; // USB serial for debugging

&nbsp; Serial.begin(115200);

&nbsp; delay(100);



&nbsp; // Init LCD

&nbsp; lcd.init();

&nbsp; lcd.backlight();

&nbsp; lcd.clear();

&nbsp; lcd.setCursor(0, 0);

&nbsp; lcd.print(" SHIELD Activated ");

&nbsp; delay(2000);

&nbsp; lcd.clear();



&nbsp; // Buzzer init

&nbsp; pinMode(BUZZER\_PIN, OUTPUT);

&nbsp; digitalWrite(BUZZER\_PIN, LOW);



&nbsp; // Start hardware serials

&nbsp; SerialPZEM.begin(9600, SERIAL\_8N1, PZEM\_RX\_PIN, PZEM\_TX\_PIN); // PZEM default 9600

&nbsp; SerialSIM.begin(9600, SERIAL\_8N1, SIM\_RX\_PIN, SIM\_TX\_PIN);   // SIM700G default 9600



&nbsp; // Small startup delay

&nbsp; delay(200);



&nbsp; // Initialize SIM700G (basic)

&nbsp; sim700Init();



&nbsp; // Connect WiFi

&nbsp; Serial.printf("Connecting to WiFi: %s\\n", ssid);

&nbsp; WiFi.begin(ssid, password);

&nbsp; unsigned long wifiStart = millis();

&nbsp; while (millis() - wifiStart < 20000) { // 20s timeout

&nbsp;   if (WiFi.status() == WL\_CONNECTED) break;

&nbsp;   delay(500);

&nbsp;   Serial.print(".");

&nbsp; }

&nbsp; wifiConnected = (WiFi.status() == WL\_CONNECTED);

&nbsp; if (wifiConnected) {

&nbsp;   Serial.println("\\nWiFi Connected ✅");

&nbsp;   secureClient.setInsecure(); // skip cert checks (same as before) - change for production

&nbsp; } else {

&nbsp;   Serial.println("\\nWiFi NOT connected - will use SIM SMS fallback for alerts");

&nbsp; }

}



// ---------------- loop ----------------

void loop() {

&nbsp; // Read GPS NMEA if available on SIM serial

&nbsp; readAndParseSIMGPS();



&nbsp; // Read PZEM values

&nbsp; float voltage = pzem.voltage();

&nbsp; float current = pzem.current();

&nbsp; float power   = pzem.power();

&nbsp; float energy  = pzem.energy();

&nbsp; float freq    = pzem.frequency();

&nbsp; float pf      = pzem.pf();



&nbsp; // Determine alert condition (same threshold logic)

&nbsp; bool alert = (!isnan(power) \&\& power > highPowerThreshold);



&nbsp; // Buzzer

&nbsp; digitalWrite(BUZZER\_PIN, alert ? HIGH : LOW);



&nbsp; // Show on LCD (or error)

&nbsp; showOnLCD(voltage, current, power, freq);



&nbsp; // Get last known GPS

&nbsp; double lat = NAN, lon = NAN;

&nbsp; if (gps.location.isValid()) {

&nbsp;   lat = gps.location.lat();

&nbsp;   lon = gps.location.lng();

&nbsp; }



&nbsp; // Upload to Firebase periodically if WiFi connected

&nbsp; if (wifiConnected \&\& millis() - lastFirebaseMillis > FIREBASE\_INTERVAL) {

&nbsp;   lastFirebaseMillis = millis();

&nbsp;   const char\* alertText = alert ? "Unauthorized Fence Detected" : "Normal";

&nbsp;   publishToFirebase(voltage, current, power, energy, freq, pf, alertText, lat, lon);

&nbsp; }



&nbsp; // If WiFi not available and alert is ON, send SMS fallback (rate-limited)

&nbsp; static unsigned long lastSms = 0;

&nbsp; const unsigned long SMS\_INTERVAL = 60UL \* 1000UL; // once per minute max

&nbsp; if (!wifiConnected \&\& alert \&\& millis() - lastSms > SMS\_INTERVAL) {

&nbsp;   lastSms = millis();

&nbsp;   char smsMsg\[200];

&nbsp;   if (gps.location.isValid()) {

&nbsp;     snprintf(smsMsg, sizeof(smsMsg), "ALERT: Unauthorized fence detected!\\nP:%.0fW I:%.2fA V:%.1fV\\nLat:%.6f Lon:%.6f",

&nbsp;              power, current, voltage, lat, lon);

&nbsp;   } else {

&nbsp;     snprintf(smsMsg, sizeof(smsMsg), "ALERT: Unauthorized fence detected!\\nP:%.0fW I:%.2fA V:%.1fV\\nGPS: N/A",

&nbsp;              power, current, voltage);

&nbsp;   }

&nbsp;   // Replace phone number with your emergency contact

&nbsp;   const char\* phoneNumber = "+911234567890";

&nbsp;   bool sent = sim700SendSMS(phoneNumber, smsMsg);

&nbsp;   Serial.printf("SMS sent: %s\\n", sent ? "OK" : "FAILED");

&nbsp; }



&nbsp; delay(3000);

}



// ---------------- Helper functions ----------------



void showOnLCD(float voltage, float current, float power, float freq) {

&nbsp; lcd.clear();

&nbsp; lcd.setCursor(0, 0);

&nbsp; if (!isnan(voltage)) {

&nbsp;   lcd.print("V:");

&nbsp;   lcd.print(voltage, 1);

&nbsp; } else lcd.print("V:Err");



&nbsp; lcd.setCursor(9, 0);

&nbsp; if (!isnan(current)) {

&nbsp;   lcd.print("I:");

&nbsp;   lcd.print(current, 2);

&nbsp; } else lcd.print("I:Err");



&nbsp; lcd.setCursor(0, 1);

&nbsp; if (!isnan(power)) {

&nbsp;   lcd.print("P:");

&nbsp;   lcd.print(power, 0);

&nbsp;   lcd.print("W ");

&nbsp; } else lcd.print("P:Err");



&nbsp; if (!isnan(freq)) {

&nbsp;   lcd.setCursor(9, 1);

&nbsp;   lcd.print("F:");

&nbsp;   lcd.print(freq, 1);

&nbsp;   lcd.print("Hz");

&nbsp; }

}



// Very basic SIM700G init. Add your existing initialization logic here if you already have it.

void sim700Init() {

&nbsp; Serial.println("Initializing SIM700G...");

&nbsp; // Wake module \& check communication

&nbsp; SerialSIM.setTimeout(1000);



&nbsp; // Simple AT check

&nbsp; for (int i = 0; i < 5; ++i) {

&nbsp;   SerialSIM.println("AT");

&nbsp;   delay(200);

&nbsp;   while (SerialSIM.available()) {

&nbsp;     String r = SerialSIM.readStringUntil('\\n');

&nbsp;     r.trim();

&nbsp;     if (r.length()) Serial.printf("SIM: %s\\n", r.c\_str());

&nbsp;   }

&nbsp;   delay(200);

&nbsp; }



&nbsp; // Echo off

&nbsp; SerialSIM.println("ATE0");

&nbsp; delay(200);



&nbsp; // Enable SMS text mode

&nbsp; SerialSIM.println("AT+CMGF=1");

&nbsp; delay(200);



&nbsp; // Enable GNSS if your SIM700G supports it (example AT command)

&nbsp; // Many SIM700G require: AT+CGNSPWR=1

