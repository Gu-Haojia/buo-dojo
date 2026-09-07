import { test, expect } from "@playwright/test";

async function prepare(page, viewport) {
  await page.setViewportSize(viewport);
  await page.clock.install();
  await page.addInitScript(() => {
    window.__wind = false;
    class TestAudioContext {
      constructor() {
        this.state = "running";
        this.sampleRate = 48000;
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
          getFloatTimeDomainData(samples) {
            for (let i = 0; i < samples.length; i++)
              samples[i] = window.__wind ? 0.1 * Math.sin(i) : 0;
          },
          getFloatFrequencyData(spectrum) {
            spectrum.fill(window.__wind ? -35 : -100);
          },
        };
      }
    }
    window.AudioContext = TestAudioContext;
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.__grantMic = () =>
          resolve({ getTracks: () => [{ stop() {}, addEventListener() {} }] });
      });
  });
  await page.goto("/");
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    ),
  );
}

test("browser toolbar heights do not resize the character, logo, or controls", async ({
  page,
}) => {
  await prepare(page, { width: 393, height: 756 });
  const measure = () =>
    page.evaluate(() => {
      const selectors = [
        ".stage",
        ".character-a",
        ".title-logo",
        ".speech",
        "#start-button",
        "#help-button",
      ];
      return selectors.map((selector) => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          selector,
          width: parseFloat(style.width),
          height: parseFloat(style.height),
          font: parseFloat(style.fontSize),
          bottom: box.bottom,
        };
      });
    });
  const baseline = await measure();
  for (const height of [640, 650, 664, 740, 844]) {
    await page.setViewportSize({ width: 393, height });
    await page.clock.runFor(100);
    const current = await measure();
    for (let i = 0; i < current.length; i++) {
      for (const dimension of ["width", "height", "font"])
        expect(
          current[i][dimension],
          `${current[i].selector} ${dimension} at viewport height ${height}`,
        ).toBeCloseTo(baseline[i][dimension], 0);
    }
    const button = current.find(
      (element) => element.selector === "#start-button",
    );
    expect(button.bottom).toBeLessThanOrEqual(height);
  }
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
]) {
  test(`stage stays fixed through microphone states at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepare(page, viewport);
    const measure = () => page.locator(".stage").boundingBox();
    const idle = await measure();
    const idleBody = await page
      .locator(".character-a")
      .evaluate(
        (element) =>
          (parseFloat(getComputedStyle(element).height) * 1097) / 1304,
      );
    await page
      .getByRole("button", { name: "法螺貝を吹く", exact: true })
      .click();
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "requesting",
    );
    const requesting = await measure();
    await page.evaluate(() => window.__grantMic());
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "calibrating",
    );
    const calibrating = await measure();
    const readyBody = await page
      .locator(".character-b")
      .evaluate(
        (element) =>
          (parseFloat(getComputedStyle(element).height) * 1320) / 1370,
      );
    const beforeMeter = await page
      .locator(".character-b")
      .evaluate((element) => element.offsetHeight);
    await page.clock.runFor(850);
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "listening",
    );
    const listening = await measure();
    const afterMeter = await page
      .locator(".character-b")
      .evaluate((element) => element.offsetHeight);
    await page.evaluate(() => {
      window.__wind = true;
    });
    await page.clock.runFor(250);
    await expect(page.locator("#dojo")).toHaveAttribute(
      "data-state",
      "blowing",
    );
    const blowing = await measure();
    for (const box of [requesting, calibrating, listening, blowing]) {
      expect(box.y).toBeCloseTo(idle.y, 0);
      expect(box.height).toBeCloseTo(idle.height, 0);
    }
    expect(afterMeter).toEqual(beforeMeter);
    const blowingBody = await page
      .locator(".character-c")
      .evaluate(
        (element) =>
          (parseFloat(getComputedStyle(element).height) * 1134) / 1287,
      );
    expect(Math.abs(readyBody - idleBody)).toBeLessThan(1);
    expect(Math.abs(blowingBody - idleBody)).toBeLessThan(1);
  });

  test(`all 31 result glyphs fit without scrolling at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepare(page, viewport);
    await page.getByRole("button", { name: "マイクなしでおためし" }).click();
    await page.locator("#hold-button").focus();
    await page.keyboard.down("Space");
    await page.clock.fastForward(31000);
    await page.keyboard.up("Space");
    await expect(page.locator("#result-dialog")).toBeVisible();
    await expect(page.locator("#result-kanji > span")).toHaveCount(31);
    await page.clock.runFor(600);
    const dimensions = await page
      .locator("#result-kanji")
      .evaluate((element) => {
        const dialog = document.querySelector("#result-dialog");
        const boxes = [...element.children].map((tile) =>
          tile.getBoundingClientRect(),
        );
        return {
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          dialogClient: dialog.clientHeight,
          dialogScroll: dialog.scrollHeight,
          minTop: Math.min(...boxes.map((box) => box.top)),
          maxBottom: Math.max(...boxes.map((box) => box.bottom)),
          font: parseFloat(
            getComputedStyle(element.firstElementChild).fontSize,
          ),
        };
      });
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(
      dimensions.clientHeight + 1,
    );
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(
      dimensions.clientWidth + 1,
    );
    expect(dimensions.minTop).toBeGreaterThanOrEqual(0);
    expect(dimensions.maxBottom).toBeLessThan(viewport.height);
    expect(dimensions.font).toBeGreaterThanOrEqual(20);
    if (viewport.height >= 667)
      expect(dimensions.dialogScroll).toBeLessThanOrEqual(
        dimensions.dialogClient + 1,
      );
  });
}
