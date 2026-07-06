const { buildStatsRows } = require("./bundle-size-stats-prepare");

const meta = { date: "2026-06-30", commit: "abc123", commitMessage: "Fix the thing (#123)", version: "" };
const measurement = (over = {}) => ({
  bundle: "embedding-sdk-chunked",
  kind: "total",
  rawBytes: 1000,
  gzipBytes: 400,
  brotliBytes: 300,
  fileCount: 3,
  ...over,
});

describe("buildStatsRows", () => {
  it("records the first point and leaves every delta empty", () => {
    const result = buildStatsRows({
      ...meta,
      measurements: [measurement()],
      previous: [],
      threshold: 1,
    });

    expect(result.firstPoint).toBe(true);
    expect(result.significant).toBe(true);
    expect(result.reason).toBe("first point");
    expect(result.rows[0]["Gzip bytes delta"]).toBe("");
    expect(result.rows[0]["Brotli delta %"]).toBe("");
    expect(result.rows[0]["Description"]).toBe("Fix the thing (#123)");
    expect(result.cacheRows[0]).toEqual({
      bundle: "embedding-sdk-chunked",
      kind: "total",
      rawBytes: 1000,
      gzipBytes: 400,
      brotliBytes: 300,
    });
  });

  it("records a never-seen bundle/kind as a new series", () => {
    const result = buildStatsRows({
      ...meta,
      measurements: [measurement({ bundle: "app", kind: "initial" })],
      previous: [{ bundle: "app", kind: "total", rawBytes: 1, gzipBytes: 1, brotliBytes: 1 }],
      threshold: 99,
    });

    expect(result.hasNewSeries).toBe(true);
    expect(result.significant).toBe(true);
    expect(result.reason).toBe("new bundle/kind series");
  });

  it("gates significance on the brotli (as-served) delta when both sides have it", () => {
    const previous = [{ bundle: "embedding-sdk-chunked", kind: "total", rawBytes: 1000, gzipBytes: 400, brotliBytes: 300 }];

    const big = buildStatsRows({
      ...meta,
      measurements: [measurement({ brotliBytes: 315, gzipBytes: 400 })], // brotli +5%, gzip 0%
      previous,
      threshold: 1,
    });
    expect(big.maxServedDeltaPercent).toBeCloseTo(5);
    expect(big.significant).toBe(true);
    expect(big.rows[0]["Brotli delta %"]).toBeCloseTo(5);

    const small = buildStatsRows({
      ...meta,
      measurements: [measurement({ brotliBytes: 301, gzipBytes: 999 })], // brotli +0.33%, gzip ignored
      previous,
      threshold: 1,
    });
    expect(small.significant).toBe(false);
    expect(small.reason).toContain("threshold 1%");
  });

  it("falls back to the gzip delta when the cached base predates brotli logging", () => {
    const result = buildStatsRows({
      ...meta,
      measurements: [measurement({ gzipBytes: 440, brotliBytes: 300 })], // gzip +10%
      previous: [{ bundle: "embedding-sdk-chunked", kind: "total", rawBytes: 1000, gzipBytes: 400 }],
      threshold: 1,
    });

    expect(result.maxServedDeltaPercent).toBeCloseTo(10);
    expect(result.significant).toBe(true);
    expect(result.rows[0]["Brotli bytes delta"]).toBe(""); // no base brotli to diff against
    expect(result.rows[0]["Gzip delta %"]).toBeCloseTo(10);
  });
});
