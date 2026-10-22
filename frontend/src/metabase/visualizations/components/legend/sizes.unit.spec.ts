import { getLegendSize } from "./sizes";

describe("getLegendSize", () => {
  it("should pick lg for large dashboard cards and sm otherwise", () => {
    expect(getLegendSize({ width: 640, height: 360 })).toBe("lg");
    expect(getLegendSize({ width: 639, height: 360 })).toBe("sm");
    expect(getLegendSize({ width: 640, height: 359 })).toBe("sm");
  });

  it("should always pick md in the query builder and fullscreen", () => {
    expect(
      getLegendSize({ width: 300, height: 200, isQueryBuilder: true }),
    ).toBe("md");
    expect(
      getLegendSize({ width: 2000, height: 900, isFullscreen: true }),
    ).toBe("md");
  });
});
