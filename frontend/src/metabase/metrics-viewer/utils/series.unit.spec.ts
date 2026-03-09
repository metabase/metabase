import type { RowValues } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import { createMockSingleSeries } from "metabase-types/api/mocks/series";

import { splitByBreakout } from "./series";

const dimensionCol = createMockColumn({
  name: "CREATED_AT",
  display_name: "Created At",
  base_type: "type/DateTime",
});

const breakoutCol = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
});

const metricCol = createMockColumn({
  name: "COUNT",
  display_name: "Count",
  base_type: "type/Integer",
});

const CARD_OPTS = { id: 1, name: "Revenue", display: "line" } as const;

describe("splitByBreakout", () => {
  describe("3 columns: [dimension, breakout, metric]", () => {
    it("splits rows by breakout value and strips breakout column", () => {
      const series = createMockSingleSeries(CARD_OPTS, {
        data: {
          cols: [dimensionCol, breakoutCol, metricCol],
          rows: [
            ["2024-01", "Gadgets", 10],
            ["2024-01", "Widgets", 20],
            ["2024-02", "Gadgets", 30],
            ["2024-02", "Widgets", 40],
          ],
        },
      });

      const result = splitByBreakout(series, 1);

      expect(result).toHaveLength(2);

      expect(result[0].data.cols).toEqual([dimensionCol, metricCol]);
      expect(result[0].data.rows).toEqual([
        ["2024-01", 10],
        ["2024-02", 30],
      ]);
      expect(result[0].card.name).toBe("Gadgets");

      expect(result[1].data.cols).toEqual([dimensionCol, metricCol]);
      expect(result[1].data.rows).toEqual([
        ["2024-01", 20],
        ["2024-02", 40],
      ]);
      expect(result[1].card.name).toBe("Widgets");
    });

    it("prefixes breakout value with card name when seriesCount > 1", () => {
      const series = createMockSingleSeries(CARD_OPTS, {
        data: {
          cols: [dimensionCol, breakoutCol, metricCol],
          rows: [
            ["2024-01", "Gadgets", 10],
            ["2024-01", "Widgets", 20],
          ],
        },
      });

      const result = splitByBreakout(series, 2);

      expect(result[0].card.name).toBe("Revenue: Gadgets");
      expect(result[1].card.name).toBe("Revenue: Widgets");
    });
  });

  describe("2 columns: [breakout, metric] (dimension == breakout)", () => {
    it("splits rows by breakout value and keeps both columns", () => {
      const series = createMockSingleSeries(CARD_OPTS, {
        data: {
          cols: [breakoutCol, metricCol],
          rows: [
            ["Gadgets", 10],
            ["Widgets", 20],
            ["Gadgets", 30],
          ],
        },
      });

      const result = splitByBreakout(series, 1);

      expect(result).toHaveLength(2);

      expect(result[0].data.cols).toEqual([breakoutCol, metricCol]);
      expect(result[0].data.rows).toEqual([
        ["Gadgets", 10],
        ["Gadgets", 30],
      ]);
      expect(result[0].card.name).toBe("Gadgets");

      expect(result[1].data.cols).toEqual([breakoutCol, metricCol]);
      expect(result[1].data.rows).toEqual([["Widgets", 20]]);
      expect(result[1].card.name).toBe("Widgets");
    });
  });

  it("assigns unique card ids to each split series", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Gadgets", 10],
          ["2024-01", "Widgets", 20],
        ],
      },
    });

    const result = splitByBreakout(series, 1);

    const ids = result.map((s) => s.card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("applies source colors to series settings", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Gadgets", 10],
          ["2024-01", "Widgets", 20],
        ],
      },
    });

    const result = splitByBreakout(series, 1, ["#509EE3", "#88BF4D"]);

    expect(result[0].card.visualization_settings.series_settings).toBeDefined();
    expect(result[1].card.visualization_settings.series_settings).toBeDefined();
  });

  it("returns original series when breakout values exceed MAX_SERIES", () => {
    const rows: RowValues[] = Array.from({ length: 102 }, (_, i) => [
      "2024-01",
      `Value ${i}`,
      i,
    ]);
    const series = createMockSingleSeries(CARD_OPTS, {
      data: { cols: [dimensionCol, breakoutCol, metricCol], rows },
    });

    const result = splitByBreakout(series, 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(series);
  });

  it("shares the same cols reference across all split series", () => {
    const series = createMockSingleSeries(CARD_OPTS, {
      data: {
        cols: [dimensionCol, breakoutCol, metricCol],
        rows: [
          ["2024-01", "Gadgets", 10],
          ["2024-01", "Widgets", 20],
        ],
      },
    });

    const result = splitByBreakout(series, 1);

    expect(result[0].data.cols).toBe(result[1].data.cols);
  });
});
