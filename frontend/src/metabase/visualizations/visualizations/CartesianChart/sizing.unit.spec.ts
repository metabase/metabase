import { CARTESIAN_CARD_SIZE_TIERS, getCartesianCardSizeTier } from "./sizing";

const [LARGE_TIER, MEDIUM_TIER, SMALL_TIER] = CARTESIAN_CARD_SIZE_TIERS;

describe("getCartesianCardSizeTier", () => {
  it("returns the smallest tier for tiny cards", () => {
    expect(getCartesianCardSizeTier(0, 0)).toBe(SMALL_TIER);
    expect(getCartesianCardSizeTier(120, 80)).toBe(SMALL_TIER);
  });

  it("picks tiers by the spec thresholds", () => {
    expect(getCartesianCardSizeTier(299, 199)).toBe(SMALL_TIER);
    expect(getCartesianCardSizeTier(300, 200)).toBe(MEDIUM_TIER);
    expect(getCartesianCardSizeTier(639, 359)).toBe(MEDIUM_TIER);
    expect(getCartesianCardSizeTier(640, 360)).toBe(LARGE_TIER);
    expect(getCartesianCardSizeTier(1200, 800)).toBe(LARGE_TIER);
  });

  it("requires both dimensions to fit before upgrading the tier", () => {
    // wide but short cards stay on the tier their height allows
    expect(getCartesianCardSizeTier(800, 199)).toBe(SMALL_TIER);
    expect(getCartesianCardSizeTier(800, 359)).toBe(MEDIUM_TIER);
    // tall but narrow cards stay on the tier their width allows
    expect(getCartesianCardSizeTier(299, 800)).toBe(SMALL_TIER);
    expect(getCartesianCardSizeTier(639, 800)).toBe(MEDIUM_TIER);
  });

  it("uses the small title size only on the smallest tier", () => {
    expect(SMALL_TIER.titleFontSize).toBe("sm");
    expect(MEDIUM_TIER.titleFontSize).toBe("md");
    expect(LARGE_TIER.titleFontSize).toBe("md");
  });
});
