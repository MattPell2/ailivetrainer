// App wiring: camera + MediaPipe pose loop + coach + UI.
// The detection loop runs continuously via requestAnimationFrame — the coach
// reacts to every frame without ever waiting for user input.

import { PoseLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { EXERCISES, matchExercise } from "./exercises.js";
import { Coach } from "./coach.js";
import { visible } from "./pose-utils.js";

const ui = {
  setupPanel: document.getElementById("setup-panel"),
  livePanel: document.getElementById("live-panel"),
  workoutText: document.getElementById("workout-text"),
  micBtn: document.getElementById("mic-btn"),
  chips: document.getElementById("workout-chips"),
  startBtn: document.getElementById("start-btn"),
  setupStatus: document.getElementById("setup-status"),
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  visibilityBanner: document.getElementById("visibility-banner"),
  exerciseName: document.getElementById("exercise-name"),
  stopBtn: document.getElementById("stop-btn"),
  repCount: document.getElementById("rep-count"),
  repLabel: document.getElementById("rep-label"),
  phaseIndicator: document.getElementById("phase-indicator"),
  formScore: document.getElementById("form-score"),
  feedbackCurrent: document.getElementById("feedback-current"),
  feedbackLog: document.getElementById("feedback-log"),
  exerciseSteps: document.getElementById("exercise-steps"),
  voiceEnabled: document.getElementById("voice-enabled"),
};

let poseLandmarker = null;
let drawingUtils = null;
let selectedExercise = null;
let activeExercise = null;
let exerciseState = {};
let running = false;
let lastVideoTime = -1;

const coach = new Coach({
  onFeedback({ text, type }) {
    ui.feedbackCurrent.textContent = text;
    ui.feedbackCurrent.classList.toggle("correction", type === "correction");
    const li = document.createElement("li");
    li.textContent = text;
    ui.feedbackLog.prepend(li);
    while (ui.feedbackLog.children.length > 30) ui.feedbackLog.lastChild.remove();
  },
});

// ---------- Setup screen ----------

function renderChips() {
  for (const ex of EXERCISES) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = ex.name;
    chip.addEventListener("click", () => selectExercise(ex, chip));
    ui.chips.appendChild(chip);
  }
}

function selectExercise(ex, chipEl = null) {
  selectedExercise = ex;
  for (const c of ui.chips.children) {
    c.classList.toggle("selected", c === chipEl || c.textContent === ex.name);
  }
  ui.startBtn.disabled = !poseLandmarker;
  ui.startBtn.textContent = `Start ${ex.name}`;
}

ui.workoutText.addEventListener("input", () => {
  const ex = matchExercise(ui.workoutText.value);
  if (ex) selectExercise(ex);
});
ui.workoutText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && selectedExercise && !ui.startBtn.disabled) startWorkout();
});

// Voice input for picking the workout (free, built into Chrome/Edge/Safari).
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognizer = new SpeechRecognition();
  recognizer.lang = "en-US";
  recognizer.interimResults = false;
  ui.micBtn.addEventListener("click", () => {
    ui.micBtn.classList.add("listening");
    recognizer.start();
  });
  recognizer.addEventListener("result", (e) => {
    const transcript = e.results[0][0].transcript;
    ui.workoutText.value = transcript;
    const ex = matchExercise(transcript);
    if (ex) selectExercise(ex);
    else ui.setupStatus.textContent = `Heard "${transcript}" — I don't know that one yet. Try a chip below.`;
  });
  recognizer.addEventListener("end", () => ui.micBtn.classList.remove("listening"));
  recognizer.addEventListener("error", () => ui.micBtn.classList.remove("listening"));
} else {
  ui.micBtn.style.display = "none";
}

// ---------- Model + camera ----------

async function loadModel() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  ui.setupStatus.textContent = "Ready. Pick a workout to begin.";
  if (selectedExercise) ui.startBtn.disabled = false;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  ui.video.srcObject = stream;
  await new Promise((resolve) => {
    ui.video.onloadedmetadata = () => {
      ui.overlay.width = ui.video.videoWidth;
      ui.overlay.height = ui.video.videoHeight;
      resolve();
    };
  });
}

function stopCamera() {
  const stream = ui.video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  ui.video.srcObject = null;
}

// ---------- Workout session ----------

async function startWorkout() {
  if (!selectedExercise || !poseLandmarker) return;
  ui.startBtn.disabled = true;
  ui.setupStatus.textContent = "Starting camera…";
  try {
    await startCamera();
  } catch (err) {
    ui.setupStatus.textContent = "Camera access denied. Please allow camera access and try again.";
    ui.startBtn.disabled = false;
    return;
  }

  activeExercise = selectedExercise;
  exerciseState = {};
  coach.reset();
  coach.voiceEnabled = ui.voiceEnabled.checked;

  ui.exerciseName.textContent = activeExercise.name;
  ui.repLabel.textContent = activeExercise.repLabel;
  ui.repCount.textContent = "0";
  ui.phaseIndicator.textContent = "—";
  ui.formScore.textContent = "—";
  ui.formScore.className = "metric-value";
  ui.feedbackLog.innerHTML = "";
  ui.exerciseSteps.innerHTML = "";
  for (const step of activeExercise.steps) {
    const li = document.createElement("li");
    li.textContent = step;
    ui.exerciseSteps.appendChild(li);
  }

  ui.setupPanel.classList.add("hidden");
  ui.livePanel.classList.remove("hidden");

  drawingUtils = new DrawingUtils(ui.overlay.getContext("2d"));
  running = true;
  lastVideoTime = -1;
  coach.announce(activeExercise.intro);
  requestAnimationFrame(detectLoop);
}

function stopWorkout() {
  running = false;
  stopCamera();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  const summary = activeExercise?.timeBased
    ? `Session done — you held for ${coach.reps} seconds total.`
    : `Session done — ${coach.reps} reps of ${activeExercise?.name ?? "your workout"}.`;
  ui.setupStatus.textContent = summary;
  ui.livePanel.classList.add("hidden");
  ui.setupPanel.classList.remove("hidden");
  ui.startBtn.disabled = false;
}

ui.startBtn.addEventListener("click", startWorkout);
ui.stopBtn.addEventListener("click", stopWorkout);
ui.voiceEnabled.addEventListener("change", () => {
  coach.voiceEnabled = ui.voiceEnabled.checked;
  if (!coach.voiceEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
});

// ---------- The always-on detection loop ----------

function detectLoop() {
  if (!running) return;

  if (ui.video.currentTime !== lastVideoTime && ui.video.videoWidth > 0) {
    lastVideoTime = ui.video.currentTime;
    const result = poseLandmarker.detectForVideo(ui.video, performance.now());
    const ctx = ui.overlay.getContext("2d");
    ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);

    const landmarks = result.landmarks?.[0];
    if (landmarks) {
      drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: "rgba(74, 222, 128, 0.7)",
        lineWidth: 3,
      });
      drawingUtils.drawLandmarks(landmarks, { color: "#4ade80", radius: 4 });

      const bodyVisible = visible(landmarks, ...activeExercise.requiredLandmarks);
      ui.visibilityBanner.classList.toggle("hidden", bodyVisible);

      if (bodyVisible) {
        const analysis = activeExercise.analyze(landmarks, exerciseState);
        coach.update(analysis, activeExercise);

        ui.repCount.textContent = String(coach.reps);
        ui.phaseIndicator.textContent = analysis.phase ?? "—";
        const score = coach.formScore();
        if (score) {
          ui.formScore.textContent = score.label;
          ui.formScore.className = `metric-value ${score.cls}`;
        }
      }
    } else {
      ui.visibilityBanner.classList.remove("hidden");
      ui.visibilityBanner.textContent = "I can't see you — step into frame";
    }
  }

  requestAnimationFrame(detectLoop);
}

// ---------- Boot ----------

renderChips();
loadModel().catch((err) => {
  console.error(err);
  ui.setupStatus.textContent = "Failed to load the AI model. Check your connection and refresh.";
});
