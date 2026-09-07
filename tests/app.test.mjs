import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Small event/media doubles for app lifecycle checks; no browser layout is mocked.
class Element {
  constructor(id = "") {
    this.id = id;
    this.hidden = false;
    this.textContent = "";
    this.value = "55";
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.style = { setProperty() {} };
    this.classList = { contains: () => false };
  }
  addEventListener(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }
  async emit(name, event = {}) {
    for (const fn of this.listeners[name] || [])
      await fn({ target: this, preventDefault() {}, ...event });
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  append(element) {
    this.children.push(element);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  remove() {}
  focus() {
    document.activeElement = this;
  }
  select() {}
  setPointerCapture() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    queueMicrotask(() => this.emit("close"));
  }
}

async function setup() {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const elements = new Map(ids.map((id) => [id, new Element(id)]));
  const poses = ["a", "b", "c"].map((pose) => {
    const element = new Element();
    element.classList.contains = (name) => name === `character-${pose}`;
    return element;
  });
  const dialogs = [elements.get("help-dialog"), elements.get("result-dialog")];
  const document = Object.assign(new Element(), {
    body: new Element(),
    activeElement: new Element(),
    hidden: false,
    getElementById: (id) => elements.get(id),
    createElement: () => new Element(),
    querySelectorAll: (selector) =>
      selector === ".character" ? poses : selector === "dialog" ? dialogs : [],
    querySelector: (selector) =>
      selector === "dialog[open]"
        ? dialogs.find((dialog) => dialog.open)
        : new Element(),
  });
  const window = Object.assign(new Element(), { isSecureContext: true });
  const frames = new Map(),
    timers = new Map(),
    contexts = [];
  let clock = 0,
    nextId = 0;
  class AudioContext {
    constructor() {
      this.state = "running";
      this.sampleRate = 48000;
      contexts.push(this);
    }
    async resume() {}
    async close() {
      this.state = "closed";
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        frequencyBinCount: 1024,
        disconnect() {},
        getFloatTimeDomainData: (array) => array.fill(0),
        getFloatFrequencyData: (array) => array.fill(-100),
      };
    }
  }
  window.AudioContext = AudioContext;
  const globals = {
    document,
    window,
    navigator: {},
    location: { href: "https://sample.github.io/yoshino/" },
    Image: class {},
    performance: { now: () => clock },
    requestAnimationFrame: (callback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback) => {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const originals = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  await import(`../app.js?test=${Math.random()}`);
  return {
    $: (id) => elements.get(id),
    document,
    window,
    navigator,
    contexts,
    frames,
    get state() {
      return elements.get("dojo").dataset.state;
    },
    setClock(value) {
      clock = value;
    },
    tick(value) {
      clock = value;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(value));
    },
    restore() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

function streamFixture() {
  const track = {
    stopped: false,
    stop() {
      this.stopped = true;
    },
    addEventListener() {},
  };
  return { track, stream: { getTracks: () => [track] } };
}

test("demo: exact glyph order, release, replay, share, and official Yoshino voting link", async () => {
  const env = await setup();
  try {
    assert.equal(env.state, "idle");
    await env.$("demo-button").emit("click");
    assert.equal(env.state, "demo-ready");
    await env.$("hold-button").emit("pointerdown", { button: 0, pointerId: 1 });
    assert.equal(env.state, "blowing");
    env.tick(3500);
    await env.$("hold-button").emit("pointerup", { pointerId: 1 });
    assert.equal(env.state, "result");
    assert.equal(env.$("result-dialog").open, true);
    assert.equal(env.$("result-time").textContent, "3.5");
    assert.deepEqual(
      env.$("result-kanji").children.map((tile) => tile.textContent),
      ["武", "謳", "鶯", "王"],
    );
    assert.equal(env.$("result-mode").hidden, false);
    let shared = "";
    env.navigator.clipboard = {
      writeText: async (text) => {
        shared = text;
      },
    };
    await env.$("share-button").emit("click");
    assert.match(shared, /【おためし】3.5秒/);
    assert.match(shared, /https:\/\/sample.github.io\/yoshino\//);
    assert.equal(
      env.$("vote-button").href,
      "https://idolmaster-official.jp/cinderellagirls/vote2026/vote/idol/yorita_yoshino",
    );
    assert.equal(env.$("vote-button").attributes["aria-disabled"], undefined);
    await env.$("again-button").emit("click");
    assert.equal(env.state, "demo-ready");
    assert.equal(env.$("live-count").textContent, "0");
  } finally {
    env.restore();
  }
});

test("demo caps at 30 seconds and clears the animation loop", async () => {
  const env = await setup();
  try {
    await env.$("demo-button").emit("click");
    await env.$("hold-button").emit("keydown", { key: "Enter", repeat: false });
    env.tick(31000);
    assert.equal(env.state, "result");
    assert.equal(env.$("result-time").textContent, "30.0");
    assert.equal(env.$("result-count").textContent, "31");
    assert.equal(env.frames.size, 0);
  } finally {
    env.restore();
  }
});

test("permission denial returns to a usable screen without retaining the audio context", async () => {
  const env = await setup();
  try {
    env.navigator.mediaDevices = {
      getUserMedia: async () => {
        throw Object.assign(new Error(), { name: "NotAllowedError" });
      },
    };
    await env.$("start-button").emit("click");
    assert.equal(env.state, "idle");
    assert.equal(env.$("start-button").disabled, false);
    assert.equal(env.contexts[0].state, "closed");
    assert.match(env.$("status-text").textContent, /おためし/);
    await env.$("demo-button").emit("click");
    assert.equal(env.state, "demo-ready");
  } finally {
    env.restore();
  }
});

test("cancelling pending permission stops a late stream and does not interrupt the demo", async () => {
  const env = await setup();
  try {
    let grant;
    env.navigator.mediaDevices = {
      getUserMedia: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    };
    const pending = env.$("start-button").emit("click");
    assert.equal(env.state, "requesting");
    await env.$("demo-button").emit("click");
    const fixture = streamFixture();
    grant(fixture.stream);
    await pending;
    assert.equal(env.state, "demo-ready");
    assert.equal(fixture.track.stopped, true);
    assert.equal(env.contexts[0].state, "closed");
  } finally {
    env.restore();
  }
});

test("calibration reaches listening and moving to the background releases the microphone", async () => {
  const env = await setup();
  try {
    const fixture = streamFixture();
    env.navigator.mediaDevices = { getUserMedia: async () => fixture.stream };
    await env.$("start-button").emit("click");
    assert.equal(env.state, "calibrating");
    env.tick(0);
    env.tick(800);
    assert.equal(env.state, "listening");
    env.document.hidden = true;
    await env.document.emit("visibilitychange");
    assert.equal(env.state, "idle");
    assert.equal(fixture.track.stopped, true);
    assert.equal(env.frames.size, 0);
  } finally {
    env.restore();
  }
});

test("native share cancellation has no clipboard side effect; unavailable clipboard offers selectable text", async () => {
  const env = await setup();
  try {
    await env.$("demo-button").emit("click");
    await env.$("hold-button").emit("pointerdown", { button: 0, pointerId: 1 });
    env.setClock(1200);
    await env.$("hold-button").emit("pointerup", { pointerId: 1 });
    let copied = false;
    env.navigator.share = async () => {
      throw Object.assign(new Error(), { name: "AbortError" });
    };
    env.navigator.clipboard = {
      writeText: async () => {
        copied = true;
      },
    };
    await env.$("share-button").emit("click");
    assert.equal(copied, false);
    delete env.navigator.share;
    delete env.navigator.clipboard;
    await env.$("share-button").emit("click");
    assert.equal(env.$("share-fallback").hidden, false);
    assert.match(env.$("share-fallback").value, /武謳/);
  } finally {
    env.restore();
  }
});
