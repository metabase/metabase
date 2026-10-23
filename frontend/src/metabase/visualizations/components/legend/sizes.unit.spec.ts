import { getLegendSizeTier } from "./sizes";

describe("getLegendSizeTier", () => {
  it("should pick largeCard for large dashboard cards and smallCard otherwise", () => {
    expect(getLegendSizeTier({ width: 640, height: 360 })).toBe("largeCard");
    expect(getLegendSizeTier({ width: 639, height: 360 })).toBe("smallCard");
    expect(getLegendSizeTier({ width: 640, height: 359 })).toBe("smallCard");
  });

  it("should always pick fullscreen in the query builder and fullscreen mode", () => {
    expect(
      getLegendSizeTier({ width: 300, height: 200, isQueryBuilder: true }),
    ).toBe("fullscreen");
    expect(
      getLegendSizeTier({ width: 2000, height: 900, isFullscreen: true }),
    ).toBe("fullscreen");
  });
});
