import { getSdkBundleStartTime, resetSdkBundleStartTime } from "./start-time";

const MOCK_SCRIPT_SRC = "https://metabase.example.com/sdk/bundle.js";
const MOCK_START_TIME = 42.5;
const MOCK_DURATION = 100;

function insertScriptTag(src: string): HTMLScriptElement {
  const script = document.createElement("script");
  script.src = src;
  script.dataset.embeddingSdkBundle = "true";
  document.body.appendChild(script);
  return script;
}

interface MockResourceTimingOpts {
  name: string;
  startTime: number;
  duration?: number;
  transferSize?: number;
  encodedBodySize?: number;
}

function mockResourceTimingEntry({
  name,
  startTime,
  duration = MOCK_DURATION,
  transferSize = 1000,
  encodedBodySize = 5000,
}: MockResourceTimingOpts): PerformanceEntry {
  // Partial stub — only the fields the implementation reads.
  return {
    name,
    startTime,
    duration,
    transferSize,
    encodedBodySize,
    entryType: "resource",
  } as unknown as PerformanceEntry;
}

describe("getSdkBundleStartTime", () => {
  let originalGetEntriesByName: typeof performance.getEntriesByName;

  beforeEach(() => {
    resetSdkBundleStartTime();
    originalGetEntriesByName = performance.getEntriesByName;
  });

  afterEach(() => {
    performance.getEntriesByName = originalGetEntriesByName;
    document
      .querySelectorAll("script[data-embedding-sdk-bundle]")
      .forEach((el) => el.remove());
  });

  it("returns startTimeMs, bundleReadyMs, and bundleCached from the Resource Timing entry", () => {
    const script = insertScriptTag(MOCK_SCRIPT_SRC);

    performance.getEntriesByName = jest.fn((name, type) => {
      if (name === script.src && type === "resource") {
        return [
          mockResourceTimingEntry({
            name: script.src,
            startTime: MOCK_START_TIME,
          }),
        ];
      }
      return [];
    });

    const result = getSdkBundleStartTime();

    expect(result).toEqual({
      startTimeMs: MOCK_START_TIME,
      bundleReadyMs: MOCK_START_TIME + MOCK_DURATION,
      bundleCached: false,
    });
    expect(performance.getEntriesByName).toHaveBeenCalledWith(
      script.src,
      "resource",
    );
  });

  it("reports bundleCached true when transferSize is 0 and detailed timing is available", () => {
    const script = insertScriptTag(MOCK_SCRIPT_SRC);

    performance.getEntriesByName = jest.fn((name, type) => {
      if (name === script.src && type === "resource") {
        return [
          mockResourceTimingEntry({
            name: script.src,
            startTime: MOCK_START_TIME,
            transferSize: 0,
            encodedBodySize: 5000,
          }),
        ];
      }
      return [];
    });

    const result = getSdkBundleStartTime();
    expect(result?.bundleCached).toBe(true);
  });

  it("reports bundleCached null when detailed timing is restricted (cross-origin)", () => {
    const script = insertScriptTag(MOCK_SCRIPT_SRC);

    performance.getEntriesByName = jest.fn((name, type) => {
      if (name === script.src && type === "resource") {
        return [
          mockResourceTimingEntry({
            name: script.src,
            startTime: MOCK_START_TIME,
            transferSize: 0,
            encodedBodySize: 0,
          }),
        ];
      }
      return [];
    });

    const result = getSdkBundleStartTime();
    expect(result?.bundleCached).toBeNull();
  });

  it("returns null when the Resource Timing entry is missing", () => {
    insertScriptTag(MOCK_SCRIPT_SRC);

    performance.getEntriesByName = jest.fn(() => []);

    expect(getSdkBundleStartTime()).toBeNull();
  });

  it("returns null when the Performance API throws", () => {
    insertScriptTag(MOCK_SCRIPT_SRC);

    performance.getEntriesByName = jest.fn(() => {
      throw new Error("blocked by sandbox");
    });

    expect(getSdkBundleStartTime()).toBeNull();
  });

  it("returns null when the script tag is not in the DOM", () => {
    performance.getEntriesByName = jest.fn(() => []);

    expect(getSdkBundleStartTime()).toBeNull();
    expect(performance.getEntriesByName).not.toHaveBeenCalled();
  });

  it("caches the result on the second call", () => {
    const script = insertScriptTag(MOCK_SCRIPT_SRC);

    performance.getEntriesByName = jest.fn((name, type) => {
      if (name === script.src && type === "resource") {
        return [
          mockResourceTimingEntry({
            name: script.src,
            startTime: MOCK_START_TIME,
          }),
        ];
      }
      return [];
    });

    const first = getSdkBundleStartTime();
    const second = getSdkBundleStartTime();

    expect(first).toEqual({
      startTimeMs: MOCK_START_TIME,
      bundleReadyMs: MOCK_START_TIME + MOCK_DURATION,
      bundleCached: false,
    });
    expect(second).toBe(first);
    expect(performance.getEntriesByName).toHaveBeenCalledTimes(1);
  });

  it("caches a null result without retrying", () => {
    performance.getEntriesByName = jest.fn(() => []);

    const first = getSdkBundleStartTime();
    const second = getSdkBundleStartTime();

    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});
