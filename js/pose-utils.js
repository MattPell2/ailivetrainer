// Geometry helpers over MediaPipe Pose landmarks.
// Landmarks are normalized [0..1] with a `visibility` score.

// MediaPipe Pose landmark indices
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

const VISIBILITY_THRESHOLD = 0.5;

export function visible(lm, ...indices) {
  return indices.every((i) => lm[i] && lm[i].visibility > VISIBILITY_THRESHOLD);
}

// Interior angle at point b formed by segments b->a and b->c, in degrees [0..180].
export function angle(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Angle of the segment a->b measured from vertical, in degrees.
// 0 = perfectly vertical, 90 = horizontal.
export function angleFromVertical(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return 0;
  // Vertical unit vector points down the screen (+y).
  const cos = Math.min(1, Math.max(-1, Math.abs(dy) / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility, b.visibility) };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Average of left/right joint angles, using whichever sides are visible.
// Returns null when neither side is trackable.
export function bilateralAngle(lm, [la, lb, lc], [ra, rb, rc]) {
  const left = visible(lm, la, lb, lc) ? angle(lm[la], lm[lb], lm[lc]) : null;
  const right = visible(lm, ra, rb, rc) ? angle(lm[ra], lm[rb], lm[rc]) : null;
  if (left !== null && right !== null) return (left + right) / 2;
  return left ?? right;
}

// Exponential moving average smoother to damp landmark jitter per scalar signal.
export class Smoother {
  constructor(alpha = 0.35) {
    this.alpha = alpha;
    this.value = null;
  }
  update(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return this.value;
    this.value = this.value === null ? v : this.alpha * v + (1 - this.alpha) * this.value;
    return this.value;
  }
  reset() {
    this.value = null;
  }
}
