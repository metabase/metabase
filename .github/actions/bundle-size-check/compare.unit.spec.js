const { compareBundles, outputPrefix } = require("./compare");

const SDK_GATE = "embedding-sdk-chunked/total";
const APP_GATE = "app/initial";

const total = (gzipBytes, over = {}) => ({
  bundle: "embedding-sdk-chunked",
  kind: "total",
  gzipBytes,
  reachable: true,
  ...over,
});

const appInitial = gzipBytes => ({ bundle: "app", kind: "initial", gzipBytes });

const compare = ({ current, base, threshold = 2, gateKeys = [SDK_GATE] }) =>
  compareBundles({ current, base, threshold, gateKeys });

describe("outputPrefix", () => {
  it("turns a gate key into a step-output prefix", () => {
    expect(outputPrefix(APP_GATE)).toBe("app_initial");
    expect(outputPrefix(SDK_GATE)).toBe("embedding_sdk_chunked_total");
  });
});

describe("compareBundles", () => {
  it("gates on the chunked SDK total and flags an increase past the threshold", () => {
    const { gates, report } = compare({ current: [total(110)], base: [total(100)] });

    expect(gates).toEqual([{ gateKey: SDK_GATE, status: "increased", percent: 10 }]);
    expect(report[0]).toContain("current vs base");
  });

  it("flags a decrease and stays stable within the threshold", () => {
    expect(compare({ current: [total(90)], base: [total(100)] }).gates[0]).toMatchObject({
      status: "decreased",
      percent: -10,
    });
    expect(compare({ current: [total(101)], base: [total(100)] }).gates[0]).toMatchObject({
      status: "stable",
      percent: 1,
    });
  });

  it("evaluates each gate against its own bundle", () => {
    const { gates } = compare({
      current: [total(100), appInitial(110)],
      base: [total(100), appInitial(100)],
      gateKeys: [APP_GATE, SDK_GATE],
    });

    expect(gates).toEqual([
      { gateKey: APP_GATE, status: "increased", percent: 10 },
      { gateKey: SDK_GATE, status: "stable", percent: 0 },
    ]);
  });

  it("skips when the two sides measured a gate differently (reachable mismatch)", () => {
    const { gates } = compare({
      current: [total(130, { reachable: true })],
      base: [total(100, { reachable: false })],
    });

    expect(gates[0].status).toBeUndefined();
    expect(gates[0].skip).toContain("predates the reachable-chunk stats");
  });

  it("errors when a gate bundle is missing on either side, without hiding the others", () => {
    const { gates } = compare({
      current: [appInitial(100)],
      base: [appInitial(100)],
      gateKeys: [APP_GATE, SDK_GATE],
    });

    expect(gates[0]).toEqual({ gateKey: APP_GATE, status: "stable", percent: 0 });
    expect(gates[1].error).toContain("embedding-sdk-chunked total");
  });

  it("reports a bundle/kind present on only one side without erroring", () => {
    const { report } = compare({ current: [total(100), appInitial(50)], base: [total(100)] });

    expect(report.some(line => line.includes("present only in current build"))).toBe(true);
  });
});
