// The coaching layer: turns raw per-frame analysis into a stream of timed,
// non-spammy spoken and on-screen feedback. This is what makes the app feel
// "always on" — it talks when something matters and stays quiet otherwise.

const SPEAK_COOLDOWN_MS = 5000;      // min gap between any two spoken messages
const ISSUE_COOLDOWN_MS = 8000;      // min gap before repeating the same correction
const ISSUE_CONFIRM_FRAMES = 8;      // frames an issue must persist before we call it
const IDLE_NUDGE_MS = 20000;         // nudge if no movement detected for this long

const MILESTONE_LINES = [
  "Great work, keep that rhythm going!",
  "You're looking strong!",
  "Nice pace, stay with it!",
  "Excellent form, keep it up!",
];

export class Coach {
  constructor({ onFeedback }) {
    this.onFeedback = onFeedback; // ({ text, type }) -> UI
    this.voiceEnabled = true;
    this.reset();
  }

  reset() {
    this.reps = 0;
    this.lastSpokeAt = 0;
    this.issueLastSaidAt = new Map();
    this.issueStreaks = new Map();
    this.lastActivityAt = performance.now();
    this.lastIdleNudgeAt = 0;
    this.recentIssueFrames = 0;
    this.totalFrames = 0;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  speak(text, { force = false } = {}) {
    if (!this.voiceEnabled || !window.speechSynthesis || !text) return;
    const now = performance.now();
    if (!force && now - this.lastSpokeAt < SPEAK_COOLDOWN_MS) return;
    if (force) window.speechSynthesis.cancel();
    if (window.speechSynthesis.speaking && !force) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
    this.lastSpokeAt = now;
  }

  announce(text) {
    this.onFeedback({ text, type: "info" });
    this.speak(text, { force: true });
  }

  // Called every frame with the analyzer result for the active exercise.
  update(result, exercise) {
    const now = performance.now();
    this.totalFrames++;

    // --- Rep counting & milestones ---
    if (result.repCompleted) {
      this.reps++;
      this.lastActivityAt = now;
      if (exercise.timeBased) {
        // Spoken count at meaningful intervals for holds.
        if (this.reps % 15 === 0) {
          this.speak(`${this.reps} seconds. Keep holding!`);
          this.onFeedback({ text: `${this.reps} seconds — keep holding!`, type: "info" });
        }
      } else {
        if (this.reps % 5 === 0) {
          const line = MILESTONE_LINES[(this.reps / 5 - 1) % MILESTONE_LINES.length];
          this.speak(`That's ${this.reps}. ${line}`);
          this.onFeedback({ text: `${this.reps} reps — ${line}`, type: "praise" });
        } else {
          this.speak(String(this.reps));
        }
      }
    }

    if (result.phase && result.phase !== "up" && result.phase !== "rest" && result.phase !== "ready") {
      this.lastActivityAt = now;
    }

    // --- Form corrections (must persist a few frames to avoid jitter noise) ---
    const activeIds = new Set();
    for (const issue of result.issues) {
      activeIds.add(issue.id);
      const streak = (this.issueStreaks.get(issue.id) ?? 0) + 1;
      this.issueStreaks.set(issue.id, streak);
      if (streak === ISSUE_CONFIRM_FRAMES) {
        const lastSaid = this.issueLastSaidAt.get(issue.id) ?? 0;
        if (now - lastSaid > ISSUE_COOLDOWN_MS) {
          this.issueLastSaidAt.set(issue.id, now);
          this.onFeedback({ text: issue.text, type: "correction" });
          this.speak(issue.say ?? issue.text, { force: true });
        }
      }
    }
    for (const id of this.issueStreaks.keys()) {
      if (!activeIds.has(id)) this.issueStreaks.delete(id);
    }
    if (result.issues.length > 0) this.recentIssueFrames++;

    // --- One-shot cues (depth prompts, encouragement) ---
    for (const cue of result.cues) {
      const lastSaid = this.issueLastSaidAt.get(cue.id) ?? 0;
      if (now - lastSaid > ISSUE_COOLDOWN_MS) {
        this.issueLastSaidAt.set(cue.id, now);
        this.onFeedback({ text: cue.text, type: cue.say ? "correction" : "praise" });
        if (cue.say) this.speak(cue.say);
      }
    }

    // --- Idle nudge: the coach notices when you stop ---
    if (now - this.lastActivityAt > IDLE_NUDGE_MS && now - this.lastIdleNudgeAt > IDLE_NUDGE_MS) {
      this.lastIdleNudgeAt = now;
      const nudge = this.reps > 0
        ? `You're at ${this.reps}. Ready for the next one when you are.`
        : "Whenever you're ready, get into position and start your first rep.";
      this.onFeedback({ text: nudge, type: "info" });
      this.speak(nudge);
    }
  }

  // Rolling form quality estimate for the UI.
  formScore() {
    if (this.totalFrames < 30) return null;
    const ratio = 1 - this.recentIssueFrames / this.totalFrames;
    if (ratio > 0.92) return { label: "Good", cls: "good" };
    if (ratio > 0.75) return { label: "OK", cls: "warn" };
    return { label: "Fix it", cls: "bad" };
  }
}
