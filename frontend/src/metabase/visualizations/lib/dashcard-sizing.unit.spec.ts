import {
  DASHCARD_SIZE_TIERS,
  getDashcardSizeTier,
  getSizeTierBodyPadding,
  getSizeTierHeaderPadding,
  getSizeTierPadding,
  getSizeTierTitleGap,
} from "./dashcard-sizing";

const [LARGE_TIER, MEDIUM_TIER, SMALL_TIER] = DASHCARD_SIZE_TIERS;

describe("getDashcardSizeTier", () => {
  it("returns the smallest tier for tiny cards", () => {
    expect(getDashcardSizeTier(0, 0)).toBe(SMALL_TIER);
    expect(getDashcardSizeTier(120, 80)).toBe(SMALL_TIER);
  });

  it("picks tiers by the spec thresholds", () => {
    expect(getDashcardSizeTier(299, 199)).toBe(SMALL_TIER);
    expect(getDashcardSizeTier(300, 200)).toBe(MEDIUM_TIER);
    expect(getDashcardSizeTier(639, 359)).toBe(MEDIUM_TIER);
    expect(getDashcardSizeTier(640, 360)).toBe(LARGE_TIER);
    expect(getDashcardSizeTier(1200, 800)).toBe(LARGE_TIER);
  });

  it("requires both dimensions to fit before upgrading the tier", () => {
    // wide but short cards stay on the tier their height allows
    expect(getDashcardSizeTier(800, 199)).toBe(SMALL_TIER);
    expect(getDashcardSizeTier(800, 359)).toBe(MEDIUM_TIER);
    // tall but narrow cards stay on the tier their width allows
    expect(getDashcardSizeTier(299, 800)).toBe(SMALL_TIER);
    expect(getDashcardSizeTier(639, 800)).toBe(MEDIUM_TIER);
  });

  it("uses the small title size only on the smallest tier", () => {
    expect(SMALL_TIER.titleFontSize).toBe("sm");
    expect(MEDIUM_TIER.titleFontSize).toBe("md");
    expect(LARGE_TIER.titleFontSize).toBe("md");
  });
});

describe("size tier style helpers", () => {
  it("returns the card padding per tier", () => {
    expect(getSizeTierPadding(SMALL_TIER)).toBe("0.75rem 1rem");
    expect(getSizeTierPadding(MEDIUM_TIER)).toBe("1.375rem 1.5rem");
    expect(getSizeTierPadding(LARGE_TIER)).toBe("2.375rem 2.5rem");
  });

  it("returns the title gap per tier", () => {
    expect(getSizeTierTitleGap(SMALL_TIER)).toBe("0.75rem");
    expect(getSizeTierTitleGap(MEDIUM_TIER)).toBe("1.375rem");
    expect(getSizeTierTitleGap(LARGE_TIER)).toBe("2rem");
  });

  it("adds the title gap below the header", () => {
    expect(getSizeTierHeaderPadding(SMALL_TIER)).toBe("0.75rem 1rem 0.75rem");
    expect(getSizeTierHeaderPadding(LARGE_TIER)).toBe("2.375rem 2.5rem 2rem");
  });

  it("skips the top body padding only when a header is present", () => {
    expect(getSizeTierBodyPadding(MEDIUM_TIER, true)).toBe("0 1.5rem 1.375rem");
    expect(getSizeTierBodyPadding(MEDIUM_TIER, false)).toBe("1.375rem 1.5rem");
  });
});
