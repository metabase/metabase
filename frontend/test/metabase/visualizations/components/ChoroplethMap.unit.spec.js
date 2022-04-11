import { getLegendTitles } from "metabase/visualizations/components/ChoroplethMap";

describe("getLegendTitles", () => {
  it("should not format short values compactly", () => {
    const groups = [
      [1.12, 1.12, 1.25],
      [1.32, 1.48],
      [9, 12, 13],
    ];
    const columnSettings = {
      column: { base_type: "type/Float" },
      number_style: "currency",
      currency: "USD",
      currency_style: "symbol",
    };

    const titles = getLegendTitles(groups, columnSettings);

    expect(titles).toEqual(["$1.12 - $1.25", "$1.32 - $1.48", "$9.00 +"]);
  });

  it("should format long values compactly", () => {
    const groups = [
      [1000.12, 1100.12, 1200.25],
      [2000.32, 2200, 2500.48],
      [11000, 12000, 13000],
    ];
    const columnSettings = {
      column: { base_type: "type/Float" },
      number_style: "currency",
      currency: "USD",
      currency_style: "symbol",
    };

    const titles = getLegendTitles(groups, columnSettings);

    expect(titles).toEqual(["$1.0k - $1.2k", "$2.0k - $2.5k", "$11.0k +"]);
  });
});
