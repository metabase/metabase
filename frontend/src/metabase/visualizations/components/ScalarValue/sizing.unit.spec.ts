import { SCALAR_SIZE_TIERS, getScalarSizeTier } from "./sizing";

describe("getScalarSizeTier", () => {
  it("returns the smallest tier for tiny cards", () => {
    expect(getScalarSizeTier(80, 80)).toBe(
      SCALAR_SIZE_TIERS[SCALAR_SIZE_TIERS.length - 1],
    );
    expect(getScalarSizeTier(0, 0).valueFontSize).toBe(17);
  });

  it("requires both dimensions to fit before upgrading the tier", () => {
    // wide but short card stays on the tier its height allows
    expect(getScalarSizeTier(800, 130).valueFontSize).toBe(32);
    // tall but narrow card stays on the tier its width allows
    expect(getScalarSizeTier(180, 800).valueFontSize).toBe(32);
  });

  it("picks tiers by the spec thresholds", () => {
    expect(getScalarSizeTier(160, 120).valueFontSize).toBe(32);
    expect(getScalarSizeTier(320, 160).valueFontSize).toBe(40);
    expect(getScalarSizeTier(400, 200).valueFontSize).toBe(48);
    expect(getScalarSizeTier(500, 240).valueFontSize).toBe(56);
    expect(getScalarSizeTier(600, 320).valueFontSize).toBe(64);
  });

  it("hides the title only on the smallest tier", () => {
    expect(getScalarSizeTier(100, 100).showsTitle).toBe(false);
    expect(getScalarSizeTier(160, 120).showsTitle).toBe(true);
  });
});
