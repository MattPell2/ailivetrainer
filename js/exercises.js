// Exercise definitions: per-frame analyzers driven by joint angles.
//
// Each exercise's analyze(lm, state) is called on every camera frame with the
// 33 pose landmarks. It returns:
//   phase        - human-readable movement phase ("down", "up", "hold"…)
//   repCompleted - true on the single frame a rep is finished
//   issues       - [{ id, text, say }] active form problems this frame
//   cues         - [{ id, text, say }] non-error guidance (depth prompts etc.)
// `state` is a plain object that persists across frames for that session;
// analyzers stash smoothers and phase flags on it.

import { LM, angle, angleFromVertical, bilateralAngle, midpoint, distance, visible, Smoother } from "./pose-utils.js";

function smoother(state, key, alpha = 0.35) {
  if (!state[key]) state[key] = new Smoother(alpha);
  return state[key];
}

export const EXERCISES = [
  {
    id: "squat",
    name: "Squats",
    aliases: ["squat", "squats", "air squat", "bodyweight squat"],
    repLabel: "reps",
    cameraHint: "Stand sideways or facing the camera, full body visible.",
    requiredLandmarks: [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
    steps: [
      "Stand with feet shoulder-width apart, toes slightly out.",
      "Brace your core and keep your chest up.",
      "Bend your knees and push your hips back, like sitting into a chair.",
      "Lower until your thighs are about parallel to the floor.",
      "Drive through your heels to stand back up.",
    ],
    intro: "Let's do squats. Stand so I can see your whole body, feet shoulder-width apart. I'll count your reps and watch your depth and your back.",
    analyze(lm, state) {
      const knee = smoother(state, "knee").update(
        bilateralAngle(lm, [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE], [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE])
      );
      if (knee === null) return { phase: state.phase ?? "ready", repCompleted: false, issues: [], cues: [] };

      const issues = [];
      const cues = [];

      // Torso lean: shoulders-to-hips line vs vertical.
      if (visible(lm, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP)) {
        const lean = smoother(state, "lean").update(
          angleFromVertical(midpoint(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER]), midpoint(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]))
        );
        if (lean > 50 && knee < 140) {
          issues.push({ id: "squat-lean", text: "Chest up — you're leaning too far forward", say: "Keep your chest up" });
        }
      }

      state.phase = state.phase ?? "standing";
      let repCompleted = false;

      if (state.phase === "standing" && knee < 150) {
        state.phase = "descending";
        state.bottomKnee = knee;
      } else if (state.phase === "descending") {
        state.bottomKnee = Math.min(state.bottomKnee, knee);
        if (knee > state.bottomKnee + 12) {
          // Turned around and heading up: judge the depth we reached.
          state.phase = "ascending";
          if (state.bottomKnee > 110) {
            cues.push({ id: "squat-depth", text: "Go deeper — aim for thighs parallel to the floor", say: "Try to go a little deeper" });
            state.shallowRep = true;
          }
        }
      } else if (state.phase === "ascending" && knee > 160) {
        state.phase = "standing";
        repCompleted = !state.shallowRep;
        if (state.shallowRep) state.shallowRep = false;
        else cues.push({ id: "squat-good", text: "Good rep!", say: null });
      }

      const phaseLabel = { standing: "up", descending: "down", ascending: "rising" }[state.phase];
      return { phase: phaseLabel, repCompleted, issues, cues };
    },
  },

  {
    id: "pushup",
    name: "Push-ups",
    aliases: ["pushup", "pushups", "push-up", "push-ups", "push up", "push ups", "press up", "press-ups"],
    repLabel: "reps",
    cameraHint: "Set up side-on to the camera so I can see your body line.",
    requiredLandmarks: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_HIP],
    steps: [
      "Place your hands slightly wider than shoulder-width on the floor.",
      "Form a straight line from head to heels — squeeze your glutes.",
      "Lower your chest until your elbows hit about 90 degrees.",
      "Press the floor away to return to the top.",
    ],
    intro: "Push-ups. Set up side-on to the camera in a plank position. I'll watch your elbow depth and make sure your hips don't sag.",
    analyze(lm, state) {
      const elbow = smoother(state, "elbow").update(
        bilateralAngle(lm, [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST], [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST])
      );
      if (elbow === null) return { phase: state.phase ?? "ready", repCompleted: false, issues: [], cues: [] };

      const issues = [];
      const cues = [];

      // Body line: shoulder-hip-ankle should stay near straight (180°).
      const bodyLine = bilateralAngle(
        lm,
        [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_ANKLE],
        [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_ANKLE]
      );
      if (bodyLine !== null) {
        const smoothLine = smoother(state, "bodyLine").update(bodyLine);
        if (smoothLine < 150) {
          issues.push({ id: "pushup-hips", text: "Keep a straight line — don't let your hips sag or pike", say: "Straighten your hips" });
        }
      }

      state.phase = state.phase ?? "top";
      let repCompleted = false;

      if (state.phase === "top" && elbow < 140) {
        state.phase = "lowering";
        state.bottomElbow = elbow;
      } else if (state.phase === "lowering") {
        state.bottomElbow = Math.min(state.bottomElbow, elbow);
        if (elbow > state.bottomElbow + 12) {
          state.phase = "pressing";
          if (state.bottomElbow > 110) {
            cues.push({ id: "pushup-depth", text: "Lower your chest more — elbows to 90°", say: "Go a bit lower" });
            state.shallowRep = true;
          }
        }
      } else if (state.phase === "pressing" && elbow > 155) {
        state.phase = "top";
        repCompleted = !state.shallowRep;
        state.shallowRep = false;
      }

      const phaseLabel = { top: "up", lowering: "down", pressing: "pressing" }[state.phase];
      return { phase: phaseLabel, repCompleted, issues, cues };
    },
  },

  {
    id: "bicep-curl",
    name: "Bicep Curls",
    aliases: ["bicep curl", "bicep curls", "curl", "curls", "dumbbell curl", "arm curl", "arm curls"],
    repLabel: "reps",
    cameraHint: "Face the camera with your upper body in frame.",
    requiredLandmarks: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
    steps: [
      "Stand tall holding your weights, palms facing forward.",
      "Pin your elbows to your sides — they shouldn't move.",
      "Curl the weight up to your shoulders.",
      "Lower slowly with control until your arms are fully straight.",
    ],
    intro: "Bicep curls. Face the camera. Keep those elbows pinned to your sides — I'll be watching them.",
    analyze(lm, state) {
      const elbow = smoother(state, "elbow").update(
        bilateralAngle(lm, [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST], [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST])
      );
      if (elbow === null) return { phase: state.phase ?? "ready", repCompleted: false, issues: [], cues: [] };

      const issues = [];
      const cues = [];

      // Elbow drift: upper arm should stay vertical while curling.
      const upperArm = visible(lm, LM.LEFT_SHOULDER, LM.LEFT_ELBOW)
        ? angleFromVertical(lm[LM.LEFT_SHOULDER], lm[LM.LEFT_ELBOW])
        : null;
      if (upperArm !== null) {
        const drift = smoother(state, "drift").update(upperArm);
        if (drift > 35 && elbow < 120) {
          issues.push({ id: "curl-swing", text: "Don't swing — keep your elbows pinned to your sides", say: "Keep your elbows still" });
        }
      }

      state.phase = state.phase ?? "down";
      let repCompleted = false;

      if (state.phase === "down" && elbow < 100) {
        state.phase = "curling";
        state.topElbow = elbow;
      } else if (state.phase === "curling") {
        state.topElbow = Math.min(state.topElbow, elbow);
        if (elbow > state.topElbow + 15) {
          state.phase = "lowering";
          if (state.topElbow > 70) {
            cues.push({ id: "curl-range", text: "Squeeze all the way up to your shoulder", say: "Curl all the way up" });
          }
        }
      } else if (state.phase === "lowering" && elbow > 150) {
        state.phase = "down";
        repCompleted = true;
      }

      const phaseLabel = { down: "down", curling: "curling", lowering: "lowering" }[state.phase];
      return { phase: phaseLabel, repCompleted, issues, cues };
    },
  },

  {
    id: "jumping-jack",
    name: "Jumping Jacks",
    aliases: ["jumping jack", "jumping jacks", "star jump", "star jumps", "jacks"],
    repLabel: "reps",
    cameraHint: "Face the camera with your whole body and arms in frame.",
    requiredLandmarks: [LM.LEFT_WRIST, LM.RIGHT_WRIST, LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.NOSE],
    steps: [
      "Stand upright, feet together, arms at your sides.",
      "Jump your feet out wide while swinging your arms overhead.",
      "Jump back to the start position in one motion.",
      "Keep a steady rhythm and land softly on the balls of your feet.",
    ],
    intro: "Jumping jacks. Face the camera, whole body in frame. Arms all the way overhead each time — I'm counting.",
    analyze(lm, state) {
      if (!visible(lm, LM.LEFT_WRIST, LM.RIGHT_WRIST, LM.LEFT_ANKLE, LM.RIGHT_ANKLE, LM.NOSE, LM.LEFT_HIP, LM.RIGHT_HIP)) {
        return { phase: state.phase ?? "ready", repCompleted: false, issues: [], cues: [] };
      }

      const handsUp = lm[LM.LEFT_WRIST].y < lm[LM.NOSE].y && lm[LM.RIGHT_WRIST].y < lm[LM.NOSE].y;
      const hipWidth = distance(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]);
      const feetSpread = distance(lm[LM.LEFT_ANKLE], lm[LM.RIGHT_ANKLE]) > hipWidth * 1.6;

      const issues = [];
      const cues = [];

      state.phase = state.phase ?? "closed";
      let repCompleted = false;

      if (state.phase === "closed" && (handsUp || feetSpread)) {
        state.phase = "open";
        if (!handsUp) {
          cues.push({ id: "jack-arms", text: "Swing your arms all the way overhead", say: "Arms all the way up" });
        }
      } else if (state.phase === "open" && !handsUp && !feetSpread) {
        state.phase = "closed";
        repCompleted = true;
      }

      return { phase: state.phase, repCompleted, issues, cues };
    },
  },

  {
    id: "lunge",
    name: "Lunges",
    aliases: ["lunge", "lunges", "forward lunge", "forward lunges", "alternating lunges"],
    repLabel: "reps",
    cameraHint: "Stand side-on to the camera, full body visible.",
    requiredLandmarks: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    steps: [
      "Stand tall, feet hip-width apart.",
      "Step forward with one leg and lower your hips.",
      "Bend both knees to about 90 degrees — back knee hovers above the floor.",
      "Push off the front foot to return, then switch legs.",
    ],
    intro: "Lunges. Stand side-on to the camera. I'll watch your front knee angle and your torso. Alternate legs each rep.",
    analyze(lm, state) {
      // The "working" knee is whichever bends more this frame.
      const leftKnee = visible(lm, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE)
        ? angle(lm[LM.LEFT_HIP], lm[LM.LEFT_KNEE], lm[LM.LEFT_ANKLE]) : null;
      const rightKnee = visible(lm, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE)
        ? angle(lm[LM.RIGHT_HIP], lm[LM.RIGHT_KNEE], lm[LM.RIGHT_ANKLE]) : null;
      if (leftKnee === null && rightKnee === null) {
        return { phase: state.phase ?? "ready", repCompleted: false, issues: [], cues: [] };
      }
      const knee = smoother(state, "knee").update(Math.min(leftKnee ?? 180, rightKnee ?? 180));

      const issues = [];
      const cues = [];

      if (visible(lm, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP)) {
        const lean = smoother(state, "lean").update(
          angleFromVertical(midpoint(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER]), midpoint(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]))
        );
        if (lean > 30 && knee < 140) {
          issues.push({ id: "lunge-lean", text: "Stay upright — don't tip your torso forward", say: "Keep your torso upright" });
        }
      }

      state.phase = state.phase ?? "standing";
      let repCompleted = false;

      if (state.phase === "standing" && knee < 140) {
        state.phase = "lowering";
        state.bottomKnee = knee;
      } else if (state.phase === "lowering") {
        state.bottomKnee = Math.min(state.bottomKnee, knee);
        if (knee > state.bottomKnee + 12) {
          state.phase = "rising";
          if (state.bottomKnee > 115) {
            cues.push({ id: "lunge-depth", text: "Drop lower — front knee to about 90°", say: "Sink a little lower" });
          }
        }
      } else if (state.phase === "rising" && knee > 160) {
        state.phase = "standing";
        repCompleted = true;
      }

      const phaseLabel = { standing: "up", lowering: "down", rising: "rising" }[state.phase];
      return { phase: phaseLabel, repCompleted, issues, cues };
    },
  },

  {
    id: "overhead-press",
    name: "Overhead Press",
    aliases: ["overhead press", "shoulder press", "press", "military press", "dumbbell press"],
    repLabel: "reps",
    cameraHint: "Face the camera with your upper body and arms in frame.",
    requiredLandmarks: [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
    steps: [
      "Hold the weights at shoulder height, palms forward.",
      "Brace your core — don't arch your lower back.",
      "Press straight up until your arms are fully locked out overhead.",
      "Lower under control back to your shoulders.",
    ],
    intro: "Overhead press. Face the camera. Press to a full lockout each rep — I'll check your extension.",
    analyze(lm, state) {
      const elbow = smoother(state, "elbow").update(
        bilateralAngle(lm, [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST], [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST])
      );
      if (elbow === null) return { phase: state.phase ?? "ready", repCompleted: false, issues: [], cues: [] };

      const wristAboveShoulder =
        visible(lm, LM.LEFT_WRIST, LM.LEFT_SHOULDER) && lm[LM.LEFT_WRIST].y < lm[LM.LEFT_SHOULDER].y;

      const issues = [];
      const cues = [];

      state.phase = state.phase ?? "rack";
      let repCompleted = false;

      if (state.phase === "rack" && elbow > 120 && wristAboveShoulder) {
        state.phase = "pressing";
        state.topElbow = elbow;
      } else if (state.phase === "pressing") {
        state.topElbow = Math.max(state.topElbow, elbow);
        if (elbow < state.topElbow - 15) {
          state.phase = "lowering";
          if (state.topElbow < 155) {
            cues.push({ id: "press-lockout", text: "Press all the way to lockout overhead", say: "Lock your arms out fully" });
          }
        }
      } else if (state.phase === "lowering" && elbow < 100) {
        state.phase = "rack";
        repCompleted = true;
      }

      const phaseLabel = { rack: "rack", pressing: "pressing", lowering: "lowering" }[state.phase];
      return { phase: phaseLabel, repCompleted, issues, cues };
    },
  },

  {
    id: "plank",
    name: "Plank",
    aliases: ["plank", "planks", "plank hold", "forearm plank"],
    repLabel: "seconds",
    timeBased: true,
    cameraHint: "Set up side-on to the camera so I can see your body line.",
    requiredLandmarks: [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_ANKLE],
    steps: [
      "Forearms on the floor, elbows under your shoulders.",
      "Step your feet back into a straight line from head to heels.",
      "Squeeze your glutes and brace your abs.",
      "Breathe steadily and hold — don't let your hips drop or rise.",
    ],
    intro: "Plank hold. Get side-on to the camera. I'll time you and warn you if your hips sag or pike. Hold as long as you can.",
    analyze(lm, state) {
      const bodyLine = bilateralAngle(
        lm,
        [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_ANKLE],
        [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_ANKLE]
      );
      if (bodyLine === null) return { phase: state.phase ?? "ready", repCompleted: false, issues: [], cues: [] };

      const smoothLine = smoother(state, "bodyLine").update(bodyLine);

      // Horizontal check: torso roughly parallel to floor means they're planking.
      const torsoTilt = visible(lm, LM.LEFT_SHOULDER, LM.LEFT_HIP)
        ? angleFromVertical(lm[LM.LEFT_SHOULDER], lm[LM.LEFT_HIP]) : 0;
      const inPlank = torsoTilt > 55 && smoothLine > 130;

      const issues = [];
      const cues = [];
      const now = performance.now();

      if (inPlank) {
        if (state.phase !== "holding") {
          state.phase = "holding";
          state.holdStart = now;
          state.lastSecondCredited = 0;
          cues.push({ id: "plank-start", text: "Timer started — hold steady!", say: "Timer started. Hold it" });
        }
        if (smoothLine < 155) {
          const sag = visible(lm, LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_ANKLE) &&
            lm[LM.LEFT_HIP].y > (lm[LM.LEFT_SHOULDER].y + lm[LM.LEFT_ANKLE].y) / 2;
          issues.push(sag
            ? { id: "plank-sag", text: "Hips are sagging — squeeze your glutes and lift them", say: "Lift your hips" }
            : { id: "plank-pike", text: "Hips too high — lower them into a straight line", say: "Lower your hips" });
        }
      } else if (state.phase === "holding") {
        state.phase = "rest";
        cues.push({ id: "plank-end", text: "Hold ended — get back in position when ready", say: "Nice hold. Rest, then back in position" });
      }

      // Credit one "rep" per second held so the counter shows seconds.
      let repCompleted = false;
      if (state.phase === "holding") {
        const heldSeconds = Math.floor((now - state.holdStart) / 1000);
        if (heldSeconds > state.lastSecondCredited) {
          state.lastSecondCredited = heldSeconds;
          repCompleted = true;
        }
      }

      return { phase: state.phase === "holding" ? "holding" : "rest", repCompleted, issues, cues };
    },
  },
];

// Match free text like "I want to do push ups" to an exercise.
export function matchExercise(text) {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  let best = null;
  let bestLen = 0;
  for (const ex of EXERCISES) {
    for (const alias of ex.aliases) {
      if (t.includes(alias) && alias.length > bestLen) {
        best = ex;
        bestLen = alias.length;
      }
    }
  }
  return best;
}
