/**
 * The data attribute on the SDK bundle script tag, dash-cased for use in
 * querySelector. Duplicated here (instead of importing from the npm package)
 * because the bundle must not depend on enterprise package code.
 */
const SDK_BUNDLE_DATA_ATTR = "embedding-sdk-bundle";

export interface StartTimeResult {
  /** High-res timestamp relative to `performance.timeOrigin`, comparable with `performance.now()`. */
  startTimeMs: number;
  /** High-res timestamp when the bundle finished loading (`startTime + duration`). */
  bundleReadyMs: number;
  /**
   * `true` when the bundle loaded from browser cache (`transferSize === 0`).
   * `null` when the timing data is restricted (cross-origin without
   * `Timing-Allow-Origin`) and cache status cannot be determined.
   */
  bundleCached: boolean | null;
}

let cached: StartTimeResult | null | undefined;

/**
 * Reads the Resource Timing `startTime` of the SDK bundle script.
 *
 * Returns `null` when the entry cannot be found (buffer full, cleared, or
 * script tag absent) or when the Performance API is blocked (data-app sandbox).
 * Caches the result after the first call — the start time never changes.
 */
export function getSdkBundleStartTime(): StartTimeResult | null {
  if (cached !== undefined) {
    return cached;
  }

  cached = readStartTime();
  return cached;
}

function readStartTime(): StartTimeResult | null {
  try {
    const script = document.querySelector<HTMLScriptElement>(
      `script[data-${SDK_BUNDLE_DATA_ATTR}="true"]`,
    );

    if (!script?.src) {
      return null;
    }

    const entries = performance.getEntriesByName(script.src, "resource");
    const first = entries[0];

    if (!first) {
      return null;
    }

    // getEntriesByName with type "resource" always returns PerformanceResourceTiming entries.
    const rt = first as PerformanceResourceTiming;

    // transferSize is 0 for both cache hits and cross-origin-restricted
    // entries. encodedBodySize > 0 confirms detailed timing is available
    // (not restricted), so transferSize === 0 reliably means a cache hit.
    const bundleCached =
      typeof rt.transferSize === "number" && rt.encodedBodySize > 0
        ? rt.transferSize === 0
        : null;

    return {
      startTimeMs: rt.startTime,
      bundleReadyMs: rt.startTime + rt.duration,
      bundleCached,
    };
  } catch {
    // The Performance API is blocked (e.g. data-app sandbox distortion).
    return null;
  }
}

/** @internal Test seam — resets the cached result so each test starts fresh. */
export function resetSdkBundleStartTime(): void {
  cached = undefined;
}
