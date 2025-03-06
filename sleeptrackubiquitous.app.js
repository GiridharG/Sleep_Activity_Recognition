






Bangle.loadWidgets();
Bangle.drawWidgets();

let hrData = [];
let motionData = [];
let sleepData = []; // Stores sleep phases with timestamps
let hrWindow = [];
let motionWindow = [];
let smoothedHR = "--";
let smoothedMotion = "--";
let sleepPhase = "Awake";
let lastPhase = "Awake";
const WINDOW_SIZE = 10;
const SCORES = {
  awake: { hr: 3, motion: 3 },
  light: { hr: 1, motion: 2 },
  rem: { hr: 2, motion: 1 },
  deep: { hr: 1, motion: 0 },
};
let hrThreshold = 10;
let motionThreshold = 0.2;
let reportMode = false;

// Helper: Calculate average of an array
function calculateAverage(data) {
  return data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
}

// Helper: Low-pass filter for smoothing
function lowPassFilter(current, previous, alpha) {
  alpha = alpha || 0.1;
  return alpha * current + (1 - alpha) * previous;
}

// Helper: Sliding window processing
function updateWindow(window, value, size) {
  window.push(value);
  if (window.length > size) window.shift();
  return calculateAverage(window);
}

// Update thresholds every minute
function optimizeThresholds() {
  if (hrData.length > 0) {
    hrThreshold = calculateAverage(hrData) * 1.2; // Adjust HR threshold dynamically
  }
  if (motionData.length > 0) {
    motionThreshold = calculateAverage(motionData) * 1.2; // Adjust motion threshold dynamically
  }
  hrData = [];
  motionData = [];
}

// Classify sleep phase based on HR and motion
function classifySleep(hr, motion) {
  let score = {
    awake: SCORES.awake.hr * (hr > hrThreshold) + SCORES.awake.motion * (motion > motionThreshold),
    light: SCORES.light.hr * (hr > hrThreshold) + SCORES.light.motion * (motion <= motionThreshold),
    rem: SCORES.rem.hr * (hr <= hrThreshold) + SCORES.rem.motion * (motion <= motionThreshold),
    deep: SCORES.deep.hr * (hr <= hrThreshold / 2) + SCORES.deep.motion * (motion < motionThreshold / 2),
  };

  let phase = Object.keys(score).reduce((a, b) => (score[a] > score[b] ? a : b));
  if (phase === "rem" && lastPhase !== "light") {
    phase = "light"; // REM typically follows light sleep
  }
  lastPhase = phase;
  return phase;
}

// Save sleep data daily
function saveSleepData() {
  const dateKey = new Date().toISOString().slice(0, 10); // e.g., "2025-01-01"
  let storedData = require("Storage").readJSON("sleepdata.json", 1) || {};
  storedData[dateKey] = sleepData;
  require("Storage").write("sleepdata.json", storedData);
  console.log("Sleep data saved.");
}

// Display real-time data
function displayData() {
  g.clear();
  g.setFont("6x8", 2);
  g.setFontAlign(0, 0);
  g.drawString("Sleep Tracker", g.getWidth() / 2, 20);
  g.setFont("6x8", 1);
  g.drawString(`HR: ${smoothedHR}`, g.getWidth() / 2, 50);
  g.drawString(`Motion: ${Math.round(smoothedMotion * 100) / 100}`, g.getWidth() / 2, 70);
  g.drawString(`Phase: ${sleepPhase}`, g.getWidth() / 2, 90);
  g.drawString("BTN1: Exit", g.getWidth() / 2, g.getHeight() - 20);
  g.flip();
}

// Display sleep report
function displayReport() {
  g.clear();
  g.setFont("6x8", 2);
  g.setFontAlign(0, 0);
  g.drawString("Sleep Report", g.getWidth() / 2, 20);

  // Calculate percentages for each phase
  let counts = { awake: 0, light: 0, rem: 0, deep: 0 };
  sleepData.forEach(entry => {
    counts[entry.phase]++;
  });
  let total = sleepData.length;
  let percentages = {
    awake: Math.round((counts.awake / total) * 100),
    light: Math.round((counts.light / total) * 100),
    rem: Math.round((counts.rem / total) * 100),
    deep: Math.round((counts.deep / total) * 100),
  };

  // Display percentages
  g.drawString(`Awake: ${percentages.awake}%`, g.getWidth() / 2, 50);
  g.drawString(`Light: ${percentages.light}%`, g.getWidth() / 2, 70);
  g.drawString(`REM: ${percentages.rem}%`, g.getWidth() / 2, 90);
  g.drawString(`Deep: ${percentages.deep}%`, g.getWidth() / 2, 110);

  // Sleep improvement suggestion
  let suggestion = "Tip: Maintain a consistent sleep schedule!";
  if (percentages.awake > 30) {
    suggestion = "Tip: Reduce stress before bedtime.";
  } else if (percentages.deep < 20) {
    suggestion = "Tip: Create a darker sleeping environment.";
  }
  g.setFont("6x8", 1);
  g.drawString(suggestion, g.getWidth() / 2, g.getHeight() - 30);

  g.flip();
}

// Start HR monitoring
function startHRM() {
  Bangle.setHRMPower(1, "sleep");
  let lastHR = 0;
  Bangle.on("HRM", function(hrm) {
    if (hrm.confidence > 80) { // Only process data with high confidence
      let filteredHR = lowPassFilter(hrm.bpm, lastHR);
      lastHR = filteredHR;
      smoothedHR = updateWindow(hrWindow, filteredHR, WINDOW_SIZE);
      hrData.push(filteredHR);
    }
  });
}

// Start accelerometer monitoring
function startAccelerometer() {
  let prevMotion = 0;
  Bangle.on("accel", function(accel) {
    let motion = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z) - 1;
    motion = lowPassFilter(motion, prevMotion);
    prevMotion = motion;
    smoothedMotion = updateWindow(motionWindow, motion, WINDOW_SIZE);
    motionData.push(motion);
  });
}

// Update sleep classification every second
function startClassification() {
  setInterval(() => {
    sleepPhase = classifySleep(smoothedHR, smoothedMotion);
    sleepData.push({ time: Date.now(), phase: sleepPhase });
    if (!reportMode) displayData();
  }, 1000);
}

// Optimize thresholds every minute
function startThresholdOptimization() {
  setInterval(optimizeThresholds, 60000);
}

// Stop all sensors and listeners
function stopSensors() {
  Bangle.setHRMPower(0, "sleep");
  Bangle.removeAllListeners("HRM");
  Bangle.removeAllListeners("accel");
}

// Toggle report view
function toggleReport() {
  reportMode = !reportMode;
  if (reportMode) {
    displayReport();
  } else {
    displayData();
  }
}

// Exit app
function exitApp() {
  stopSensors();
  saveSleepData();
  load();
}

// Set BTN1 to exit the app
setWatch(exitApp, BTN1, { repeat: false });
// Set BTN2 to toggle report view
setWatch(toggleReport, BTN2, { repeat: true });

// Start the app
g.clear();
g.setFont("6x8", 2);
g.setFontAlign(0, 0);
g.drawString("Starting Sleep Tracker", g.getWidth() / 2, g.getHeight() / 2);
g.flip();
startHRM();
startAccelerometer();
startClassification();
startThresholdOptimization();

