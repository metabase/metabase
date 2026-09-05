import { getDashcardSizeTier } from "metabase/visualizations/lib/dashcard-sizing";

import { getChartGap, getChartPadding } from "./padding";

const THEME = { other: { cartesian: {} } };
const THEME_WITH_PADDING = { other: { cartesian: { padding: "3rem" } } };

const SMALL_TIER = getDashcardSizeTier(0, 0);
const MEDIUM_TIER = getDashcardSizeTier(300, 200);
const LARGE_TIER = getDashcardSizeTier(640, 360);

describe("getChartPadding", () => {
  it("prefers the theme padding override over any other option", () => {
    expect(getChartPadding({ theme: THEME_WITH_PADDING })).toBe("3rem");
    expect(
      getChartPadding({ theme: THEME_WITH_PADDING, isQueryBuilder: true }),
    ).toBe("3rem");
    expect(
      getChartPadding({ theme: THEME_WITH_PADDING, sizeTier: LARGE_TIER }),
    ).toBe("3rem");
  });

  it("keeps the query builder padding", () => {
    expect(getChartPadding({ theme: THEME, isQueryBuilder: true })).toBe(
      "1rem 1rem 1rem 2rem",
    );
  });

  it("returns the size tier padding for dashboard cards", () => {
    expect(getChartPadding({ theme: THEME, sizeTier: SMALL_TIER })).toBe(
      "0.75rem 1rem",
    );
    expect(getChartPadding({ theme: THEME, sizeTier: MEDIUM_TIER })).toBe(
      "1.375rem 1.5rem",
    );
    expect(getChartPadding({ theme: THEME, sizeTier: LARGE_TIER })).toBe(
      "2.375rem 2.5rem",
    );
  });

  it("falls back to the default padding without a size tier", () => {
    expect(getChartPadding({ theme: THEME })).toBe("0.5rem 1rem");
  });
});

describe("getChartGap", () => {
  it("keeps the query builder layout without a gap", () => {
    expect(getChartGap({ isQueryBuilder: true })).toBe("0");
  });

  it("returns the size tier title gap for dashboard cards", () => {
    expect(getChartGap({ sizeTier: SMALL_TIER })).toBe("0.75rem");
    expect(getChartGap({ sizeTier: MEDIUM_TIER })).toBe("1.375rem");
    expect(getChartGap({ sizeTier: LARGE_TIER })).toBe("2rem");
  });

  it("falls back to the default gap without a size tier", () => {
    expect(getChartGap({})).toBe("0.325rem");
  });
});
