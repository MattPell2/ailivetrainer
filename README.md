# 🏋️ AI Live Trainer

A **free, always-on AI workout instructor** that watches you through your camera and coaches you in real time — counting reps, checking your form, and speaking feedback out loud while you move. No waiting, no turn-taking, no accounts, no API keys.

## How it works

Instead of streaming video to a cloud AI (slow and expensive), everything runs **on-device in your browser**:

1. **MediaPipe Pose** (Google's open-source model, loaded via CDN) tracks 33 body landmarks at ~30 frames per second using your webcam.
2. A **coaching engine** computes joint angles every frame, runs a per-exercise state machine to track movement phases, counts reps, and detects form errors (shallow squats, sagging hips, swinging elbows…).
3. **Web Speech API** speaks corrections and encouragement aloud — with cooldowns so the coach talks when it matters and stays quiet otherwise.

Your video **never leaves your device.**

## Supported exercises

| Exercise | What the coach watches |
|---|---|
| Squats | Depth (thighs to parallel), forward lean, rep counting |
| Push-ups | Elbow depth, hip sag/pike (body line), rep counting |
| Bicep curls | Full range of motion, elbow swing/drift |
| Jumping jacks | Arms fully overhead, foot spread, rep counting |
| Lunges | Front knee depth, upright torso |
| Overhead press | Full lockout overhead |
| Plank | Hold timer, hip sag/pike warnings |

You can pick an exercise with a tap, type it ("I want to do push-ups"), or say it out loud with the 🎤 button.

## Running it

Browsers only allow camera access on `https://` or `localhost`, so serve the folder locally:

```bash
# any static server works; with Python:
python3 -m http.server 8000
```

Then open **http://localhost:8000**, allow camera access, pick a workout, and start moving.

> Works best in Chrome or Edge. Voice input for workout selection requires Chrome/Edge/Safari; voice *output* (the coach speaking) works in all modern browsers.

## Tips for best tracking

- Make sure your **whole body** is in frame (the app will tell you if it isn't).
- Good lighting helps a lot.
- For squats, push-ups, lunges, and planks, a **side-on** camera angle gives the most accurate form analysis.

## Project structure

```
index.html        UI shell
css/style.css     Styling
js/app.js         Camera, pose-detection loop, UI wiring
js/exercises.js   Per-exercise analyzers (angles, phases, form rules)
js/coach.js       Feedback timing, rep milestones, text-to-speech
js/pose-utils.js  Joint-angle math and landmark helpers
```

## Adding a new exercise

Add an entry to `EXERCISES` in `js/exercises.js` with a name, aliases, step-by-step instructions, and an `analyze(landmarks, state)` function that returns the current phase, whether a rep just completed, and any active form issues. The coach engine handles everything else (counting, speech, cooldowns) automatically.
