import { getSdkBundleStartTime, resetSdkBundleStartTime } from "./start-time";

const MOCK_SCRIPT_SRC = "https://metabase.example.com/sdk/bundle.js";
const MOCK_START_TIME = 42.5;

function insertScriptTag(src: string): HTMLScriptElement {
  const script = document.createElement("script");
  script.src = src;
  script.dataset.embeddingSdkBundle = "true";
  document.body.appendChild(script);
  return script;
}

function mockResourceTimingEntry(
  name: string,
  startTime: number,
): PerformanceEntry {
  // Only the fields the implementation reads; the full interface has ~20 more.
  return { name, startTime, entryType: "resource" } as PerformanceEntry;
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

  it("returns startTimeMs from the Resource Timing entry", () => {
    const script = insertScriptTag(MOCK_SCRIPT_SRC);

    performance.getEntriesByName = jest.fn((name, type) => {
      if (name === script.src && type === "resource") {
        return [mockResourceTimingEntry(script.src, MOCK_START_TIME)];
      }
      return [];
    });

    const result = getSdkBundleStartTime();

    expect(result).toEqual({ startTimeMs: MOCK_START_TIME });
    expect(performance.getEntriesByName).toHaveBeenCalledWith(
      script.src,
      "resource",
    );
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
        return [mockResourceTimingEntry(script.src, MOCK_START_TIME)];
      }
      return [];
    });

    const first = getSdkBundleStartTime();
    const second = getSdkBundleStartTime();

    expect(first).toEqual({ startTimeMs: MOCK_START_TIME });
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
