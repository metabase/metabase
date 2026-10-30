import { SCALAR_SIZE_TIERS, getScalarSizeTier } from "./sizing";

describe("getScalarSizeTier", () => {
  it("returns the smallest tier for tiny cards", () => {
    expect(getScalarSizeTier(80, 80)).toBe(
      SCALAR_SIZE_TIERS[SCALAR_SIZE_TIERS.length - 1],
    );
    expect(getScalarSizeTier(0, 0).size).toBe(100);
  });

  it("requires both dimensions to fit before upgrading the tier", () => {
    // wide but short card stays on the tier its height allows
    expect(getScalarSizeTier(800, 130).size).toBe(200);
    // tall but narrow card stays on the tier its width allows
    expect(getScalarSizeTier(180, 800).size).toBe(200);
  });

  it("picks tiers by the spec thresholds", () => {
    expect(getScalarSizeTier(160, 120).size).toBe(200);
    expect(getScalarSizeTier(320, 160).size).toBe(300);
    expect(getScalarSizeTier(400, 200).size).toBe(400);
    expect(getScalarSizeTier(500, 240).size).toBe(500);
    expect(getScalarSizeTier(600, 320).size).toBe(600);
  });

  it("distinguishes short wide cards from the smallest cards", () => {
    expect(getScalarSizeTier(119, 82).size).toBe(100);
    expect(getScalarSizeTier(120, 63).size).toBe(100);
    expect(getScalarSizeTier(120, 64).size).toBe(150);
    expect(getScalarSizeTier(800, 82).size).toBe(150);
    expect(getScalarSizeTier(160, 119).size).toBe(150);
    expect(getScalarSizeTier(160, 120).size).toBe(200);
  });

  it("lists every comparison only from the spec min-height of each tier", () => {
    expect(getScalarSizeTier(100, 400).multiComparisonMinHeight).toBeNull();
    expect(getScalarSizeTier(126, 400).multiComparisonMinHeight).toBeNull();
    expect(getScalarSizeTier(160, 120).multiComparisonMinHeight).toBe(240);
    expect(getScalarSizeTier(320, 160).multiComparisonMinHeight).toBe(256);
    expect(getScalarSizeTier(400, 200).multiComparisonMinHeight).toBe(264);
    expect(getScalarSizeTier(500, 240).multiComparisonMinHeight).toBe(288);
    expect(getScalarSizeTier(600, 320).multiComparisonMinHeight).toBe(320);
  });
});
