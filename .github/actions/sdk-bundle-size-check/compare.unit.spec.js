const { compareBundles } = require("./compare");

const total = (gzipBytes, over = {}) => ({
  bundle: "embedding-sdk-chunked",
  kind: "total",
  gzipBytes,
  reachable: true,
  ...over,
});

describe("compareBundles", () => {
  it("gates on the chunked SDK total and flags an increase past the threshold", () => {
    const { gate, report } = compareBundles({
      current: [total(110)],
      base: [total(100)],
      threshold: 2,
    });

    expect(gate).toEqual({ status: "increased", percent: 10 });
    expect(report[0]).toContain("current vs base");
  });

  it("flags a decrease and stays stable within the threshold", () => {
    expect(compareBundles({ current: [total(90)], base: [total(100)], threshold: 2 }).gate).toEqual({
      status: "decreased",
      percent: -10,
    });
    expect(compareBundles({ current: [total(101)], base: [total(100)], threshold: 2 }).gate).toEqual({
      status: "stable",
      percent: 1,
    });
  });

  it("skips when the two sides measured total differently (reachable mismatch)", () => {
    const result = compareBundles({
      current: [total(130, { reachable: true })],
      base: [total(100, { reachable: false })],
      threshold: 2,
    });

    expect(result.gate).toBeUndefined();
    expect(result.skip).toContain("predates the reachable-chunk stats");
  });

  it("errors when the gate bundle is missing on either side", () => {
    const result = compareBundles({
      current: [{ bundle: "app", kind: "total", gzipBytes: 1 }],
      base: [total(100)],
      threshold: 2,
    });

    expect(result.gate).toBeUndefined();
    expect(result.error).toContain("embedding-sdk-chunked total");
  });

  it("reports a bundle/kind present on only one side without erroring", () => {
    const { report } = compareBundles({
      current: [total(100), { bundle: "app", kind: "total", gzipBytes: 50 }],
      base: [total(100)],
      threshold: 2,
    });

    expect(report.some(line => line.includes("present only in current build"))).toBe(true);
  });
});
