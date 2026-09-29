import { createCoverageCounters } from "../support/coverage-counters";

const APP = "http://localhost:4000";
const APP_FILE = "/repo/frontend/src/app.js";
const EMBED_FILE = "/repo/frontend/src/embed.js";

// One file's Istanbul counters: `f` from `fired`, one statement counter per function and a two-arm branch.
function fileCoverage(fired) {
  return {
    f: Object.fromEntries(fired.map((count, i) => [i, count])),
    s: Object.fromEntries(fired.map((count, i) => [i, count])),
    b: { 0: [fired[0], 0] },
  };
}

class FakeDocument {
  listeners = [];

  addEventListener(type, listener, capture) {
    this.listeners.push({ type, listener, capture });
  }

  load(element) {
    this.listeners
      .filter(({ type, capture }) => type === "load" && capture)
      .forEach(({ listener }) => listener({ target: element }));
  }
}

function fakeWindow({ origin = APP, coverage, frames = [] } = {}) {
  return {
    location: { origin },
    __coverage__: coverage,
    document: new FakeDocument(),
    frames,
  };
}

// A frame the browser won't let the page read, which throws on every property but `frames`.
function unreadableWindow(coverage) {
  const win = { frames: [] };
  for (const key of ["location", "__coverage__", "document"]) {
    Object.defineProperty(win, key, {
      get() {
        throw new Error("SecurityError");
      },
    });
  }
  win.hidden = coverage;
  return win;
}

describe("createCoverageCounters", () => {
  it("should read and zero only the top window's counters without frames", () => {
    const frame = fakeWindow({ coverage: { [EMBED_FILE]: fileCoverage([2]) } });
    const top = fakeWindow({
      coverage: { [APP_FILE]: fileCoverage([1, 0, 3]) },
      frames: [frame],
    });
    const counters = createCoverageCounters();
    counters.track(top);
    const branchHits = {};

    expect(counters.collectAndZero(top, branchHits)).toEqual({
      [APP_FILE]: { 0: 1, 2: 3 },
    });
    expect(branchHits).toEqual({ [APP_FILE]: { 0: [1] } });
    expect(top.__coverage__[APP_FILE]).toEqual(fileCoverage([0, 0, 0]));
    expect(frame.__coverage__[EMBED_FILE]).toEqual(fileCoverage([2]));
    expect(top.document.listeners).toEqual([]);
  });

  it("should read and zero same-origin frames, nested ones included", () => {
    const nested = fakeWindow({ coverage: { [APP_FILE]: fileCoverage([5]) } });
    const frame = fakeWindow({
      coverage: {
        [EMBED_FILE]: fileCoverage([2]),
        [APP_FILE]: fileCoverage([1]),
      },
      frames: [nested],
    });
    const top = fakeWindow({
      coverage: { [APP_FILE]: fileCoverage([1, 0, 3]) },
      frames: [frame],
    });
    const counters = createCoverageCounters({ frames: true });
    const branchHits = {};

    expect(counters.collectAndZero(top, branchHits)).toEqual({
      [APP_FILE]: { 0: 7, 2: 3 },
      [EMBED_FILE]: { 0: 2 },
    });
    expect(branchHits).toEqual({
      [APP_FILE]: { 0: [7] },
      [EMBED_FILE]: { 0: [2] },
    });
    expect(frame.__coverage__[EMBED_FILE]).toEqual(fileCoverage([0]));
    expect(nested.__coverage__[APP_FILE]).toEqual(fileCoverage([0]));
  });

  it("should skip cross-origin frames whether or not the browser lets it read them", () => {
    const readable = fakeWindow({
      origin: "http://127.0.0.1:4000",
      coverage: { [EMBED_FILE]: fileCoverage([4]) },
    });
    const unreadable = unreadableWindow({ [EMBED_FILE]: fileCoverage([6]) });
    const top = fakeWindow({
      coverage: { [APP_FILE]: fileCoverage([1]) },
      frames: [readable, unreadable],
    });
    const counters = createCoverageCounters({ frames: true });

    expect(counters.collectAndZero(top)).toEqual({ [APP_FILE]: { 0: 1 } });
    expect(readable.__coverage__[EMBED_FILE]).toEqual(fileCoverage([4]));
    expect(unreadable.hidden[EMBED_FILE]).toEqual(fileCoverage([6]));
  });

  it("should count a frame reached twice once", () => {
    const frame = fakeWindow({ coverage: { [EMBED_FILE]: fileCoverage([2]) } });
    const top = fakeWindow({
      coverage: { [APP_FILE]: fileCoverage([1]) },
      frames: [frame, frame],
    });
    const counters = createCoverageCounters({ frames: true });
    counters.track(top);
    counters.track(top);
    top.document.load({ tagName: "IFRAME", contentWindow: frame });

    expect(counters.collectAndZero(top)).toEqual({
      [APP_FILE]: { 0: 1 },
      [EMBED_FILE]: { 0: 2 },
    });
  });

  it("should keep the counts of a frame that went away before the flush, then drop the frame", () => {
    const frame = fakeWindow({ coverage: { [EMBED_FILE]: fileCoverage([2]) } });
    const top = fakeWindow({ coverage: {}, frames: [frame] });
    const counters = createCoverageCounters({ frames: true });
    counters.track(top);
    top.frames.length = 0;

    expect(counters.collectAndZero(top)).toEqual({ [EMBED_FILE]: { 0: 2 } });
    frame.__coverage__[EMBED_FILE].f[0] = 9;
    expect(counters.collectAndZero(top)).toEqual({});
  });

  it("should read a frame that loaded and went away between two reads", () => {
    const top = fakeWindow({ coverage: {} });
    const counters = createCoverageCounters({ frames: true });
    counters.track(top);
    const frame = fakeWindow({ coverage: { [EMBED_FILE]: fileCoverage([3]) } });
    const nested = fakeWindow({ coverage: { [APP_FILE]: fileCoverage([1]) } });
    top.document.load({ tagName: "IMG" });
    top.document.load({ tagName: "IFRAME", contentWindow: frame });
    frame.document.load({ tagName: "IFRAME", contentWindow: nested });

    expect(counters.collectAndZero(top)).toEqual({
      [EMBED_FILE]: { 0: 3 },
      [APP_FILE]: { 0: 1 },
    });
  });

  it("should ignore a cross-origin frame that loads", () => {
    const top = fakeWindow({ coverage: {} });
    const counters = createCoverageCounters({ frames: true });
    counters.track(top);
    const unreadable = unreadableWindow({ [EMBED_FILE]: fileCoverage([6]) });
    top.document.load({ tagName: "IFRAME", contentWindow: unreadable });

    expect(counters.collectAndZero(top)).toEqual({});
  });

  it("should sum a function's deltas from a frame and the window around it into one triple per cut", () => {
    const frame = fakeWindow({
      coverage: { [APP_FILE]: fileCoverage([2, 0]) },
    });
    const top = fakeWindow({
      coverage: { [APP_FILE]: fileCoverage([1, 1]) },
      frames: [frame],
    });
    const counters = createCoverageCounters({ frames: true });
    const files = [];
    const fileIndex = (file) =>
      files.includes(file) ? files.indexOf(file) : files.push(file) - 1;
    counters.track(top);

    expect(counters.functionDeltas(fileIndex)).toEqual([0, 0, 3, 0, 1, 1]);
    frame.__coverage__[APP_FILE].f[1] = 4;
    expect(counters.functionDeltas(fileIndex)).toEqual([0, 1, 4]);
    expect(counters.collectAndZero(top)).toEqual({
      [APP_FILE]: { 0: 3, 1: 5 },
    });
  });

  it("should give the same cuts and flush without frames as the top window alone", () => {
    const withFrame = createCoverageCounters();
    const alone = createCoverageCounters();
    const coverage = () => ({ [APP_FILE]: fileCoverage([1, 0, 3]) });
    const frame = fakeWindow({ coverage: coverage() });
    const top = fakeWindow({ coverage: coverage(), frames: [frame] });
    const single = fakeWindow({ coverage: coverage() });
    const fileIndex = () => 0;
    withFrame.track(top);
    alone.track(single);

    expect(withFrame.functionDeltas(fileIndex)).toEqual(
      alone.functionDeltas(fileIndex),
    );
    expect(withFrame.collectAndZero(top)).toEqual(alone.collectAndZero(single));
  });

  it("should start a cut's deltas from zero after the flush", () => {
    const frame = fakeWindow({ coverage: { [EMBED_FILE]: fileCoverage([2]) } });
    const top = fakeWindow({ coverage: {}, frames: [frame] });
    const counters = createCoverageCounters({ frames: true });
    const fileIndex = () => 0;
    counters.track(top);
    expect(counters.functionDeltas(fileIndex)).toEqual([0, 0, 2]);
    counters.collectAndZero(top);
    counters.resetPreviousCounts();
    frame.__coverage__[EMBED_FILE].f[0] = 1;

    expect(counters.functionDeltas(fileIndex)).toEqual([0, 0, 1]);
  });
});
