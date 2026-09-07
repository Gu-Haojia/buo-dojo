import test from "node:test";
import assert from "node:assert/strict";
import {
  BreathDetector,
  analyzeSignal,
  glyphAt,
  glyphsForDuration,
  O_KANJI,
} from "../breath.js";
import { CONFIG } from "../config.js";

const quiet = {
  rms: 0.001,
  crest: 3,
  flatness: 0.3,
  highRatio: 0.2,
  lowRatio: 0.3,
};
const wind = {
  rms: 0.065,
  crest: 3,
  flatness: 0.35,
  highRatio: 0.2,
  lowRatio: 0.6,
};
function calibrated(options = {}) {
  const detector = new BreathDetector(options);
  for (let now = 0; now <= 800; now += 20) detector.update(now, quiet);
  assert.equal(detector.state, "listening");
  return detector;
}

test("the requested opening is followed by a varied お reading pool", () => {
  assert.deepEqual(glyphsForDuration(3100), ["武", "謳", "鶯", "王"]);
  assert.equal(glyphAt(4), "緒");
  assert.equal(new Set(O_KANJI).size, O_KANJI.length);
  assert.equal(glyphAt(4 + O_KANJI.length), O_KANJI[0]);
});
test("one initial glyph, then one each second, including the exact boundary", () => {
  assert.equal(glyphsForDuration(0).length, 1);
  assert.equal(glyphsForDuration(999).length, 1);
  assert.equal(glyphsForDuration(1000).length, 2);
  assert.equal(glyphsForDuration(30000).length, 31);
  assert.throws(() => glyphsForDuration(-1), RangeError);
  assert.throws(() => glyphsForDuration(1, 0), RangeError);
  assert.throws(() => glyphAt(-1), RangeError);
});
test("quiet input never starts a round", () => {
  const detector = calibrated();
  for (let now = 820; now < 8000; now += 20)
    assert.equal(detector.update(now, quiet).type, "listening");
});
test("an isolated puff or click is rejected instead of opening results", () => {
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1080, wind);
  detector.update(1100, quiet);
  detector.update(1300, wind);
  detector.update(1450, wind);
  assert.equal(detector.state, "listening");
});
test("sustained breath starts after debounce and excludes trailing silence from time", () => {
  const detector = calibrated();
  for (let now = 1000; now < 1200; now += 20)
    assert.equal(detector.update(now, wind).type, "listening");
  const start = detector.update(1200, wind);
  assert.equal(start.type, "start");
  assert.equal(start.startedAt, 1000);
  for (let now = 1220; now <= 4300; now += 20) detector.update(now, wind);
  assert.equal(detector.update(5000, quiet).type, "blowing");
  const end = detector.update(5050, quiet);
  assert.equal(end.type, "end");
  assert.equal(end.durationMs, 3300);
  assert.equal(detector.update(7000, wind).type, "ended");
});
test("brief breathing fluctuations do not split a round", () => {
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1200, wind);
  detector.update(2000, wind);
  assert.equal(detector.update(2400, quiet).type, "blowing");
  assert.equal(detector.update(2500, wind).type, "blowing");
  assert.equal(detector.update(3249, quiet).type, "blowing");
  assert.equal(detector.update(3250, quiet).durationMs, 1500);
});
test("a weaker ongoing breath survives the lower hold threshold", () => {
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1200, wind);
  const soft = { ...wind, rms: detector.threshold * 0.8 };
  detector.update(1900, soft);
  assert.equal(detector.update(2400, quiet).type, "blowing");
});
test("a loud narrow tonal signal does not pass the wind-shape gate", () => {
  const detector = calibrated();
  const tone = {
    rms: 0.1,
    crest: 1.4,
    flatness: 0.001,
    highRatio: 0.001,
    lowRatio: 0.01,
  };
  for (let now = 1000; now < 3000; now += 20)
    assert.equal(detector.update(now, tone).type, "listening");
});
test("both configured and default limits stop at 30 seconds even after a delayed frame", () => {
  assert.equal(CONFIG.maxBlowSeconds, 30);
  const detector = calibrated();
  detector.update(1000, wind);
  detector.update(1200, wind);
  detector.update(30999, wind);
  const end = detector.update(31500, wind);
  assert.equal(end.type, "end");
  assert.equal(end.durationMs, 30000);
  assert.equal(end.capped, true);
});
test("sensitivity and measured ambient noise affect the threshold", () => {
  const detector = calibrated();
  const normal = detector.threshold;
  detector.sensitivity = 100;
  assert.ok(detector.threshold < normal);
  detector.sensitivity = 0;
  assert.ok(detector.threshold > normal);
  const noisy = new BreathDetector();
  for (let now = 0; now <= 800; now += 20)
    noisy.update(now, { ...quiet, rms: 0.015 });
  assert.ok(noisy.threshold > normal);
});
test("signal analysis removes DC offset and separates broadband from tonal spectra", () => {
  const samples = Float32Array.from(
    { length: 2048 },
    (_, index) => 0.25 + 0.1 * Math.sin((2 * Math.PI * index) / 32),
  );
  const broadband = new Float32Array(1024).fill(-35);
  const features = analyzeSignal(samples, broadband, 48000);
  assert.ok(Math.abs(features.rms - 0.1 / Math.sqrt(2)) < 1e-6);
  assert.ok(features.flatness > 0.99);
  const tone = new Float32Array(1024).fill(-100);
  tone[43] = -10;
  assert.ok(analyzeSignal(samples, tone, 48000).flatness < 0.01);
  assert.equal(
    analyzeSignal(new Float32Array(2048).fill(0.5), broadband, 48000).rms,
    0,
  );
});
