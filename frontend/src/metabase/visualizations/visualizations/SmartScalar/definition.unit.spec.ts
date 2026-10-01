import { checkNotNull } from "metabase/utils/types";
import { ChartSettingsError } from "metabase/viz-core";
import type { DatasetColumn, RowValues } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockCategoryColumn,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks/dataset";

import { SMART_SCALAR_CHART_DEFINITION } from "./definition";

const isSensible = checkNotNull(SMART_SCALAR_CHART_DEFINITION.isSensible);

const dateBreakout = createMockDatetimeColumn({
  name: "Created At",
  display_name: "Created At",
  source: "breakout",
});

const countAggregation = createMockNumericColumn({
  name: "Count",
  display_name: "Count",
  source: "aggregation",
});

const sumAggregation = createMockNumericColumn({
  name: "Sum",
  display_name: "Sum",
  source: "aggregation",
});

const categoryBreakout = createMockCategoryColumn({
  name: "Category",
  display_name: "Category",
  source: "breakout",
});

const nativeDate = createMockDatetimeColumn({
  name: "created_at",
  display_name: "created_at",
  source: "native",
  base_type: "type/Instant",
  effective_type: "type/Instant",
  unit: undefined,
});

const nativeCount = createMockNumericColumn({
  name: "count",
  display_name: "count",
  source: "native",
});

const timeseriesRows: RowValues[] = [
  ["2024-01-01", 10],
  ["2024-02-01", 20],
];

const makeData = (cols: DatasetColumn[], rows: RowValues[] = timeseriesRows) =>
  createMockDatasetData({ cols, rows, insights: undefined });

const makeSeries = (
  cols: DatasetColumn[],
  rows: RowValues[] = timeseriesRows,
) => [
  {
    card: createMockCard({ display: "smartscalar" }),
    data: makeData(cols, rows),
  },
];

describe("SMART_SCALAR_CHART_DEFINITION", () => {
  describe("isSensible", () => {
    it("returns true for a GUI timeseries without insights", () => {
      expect(isSensible(makeData([dateBreakout, countAggregation]))).toBe(true);
    });

    it("returns true for a native timeseries (e.g. Mongo) without insights", () => {
      expect(isSensible(makeData([nativeDate, nativeCount]))).toBe(true);
    });

    it("returns true with multiple metrics and a single date dimension", () => {
      expect(
        isSensible(
          makeData(
            [dateBreakout, countAggregation, sumAggregation],
            [
              ["2024-01-01", 10, 100],
              ["2024-02-01", 20, 200],
            ],
          ),
        ),
      ).toBe(true);
    });

    it("returns false with an extra non-metric dimension", () => {
      expect(
        isSensible(
          makeData(
            [dateBreakout, categoryBreakout, countAggregation],
            [
              ["2024-01-01", "A", 10],
              ["2024-02-01", "B", 20],
            ],
          ),
        ),
      ).toBe(false);
    });

    it("returns false with no date column", () => {
      expect(
        isSensible(
          makeData(
            [categoryBreakout, countAggregation],
            [
              ["A", 10],
              ["B", 20],
            ],
          ),
        ),
      ).toBe(false);
    });

    it("returns false with no metric column", () => {
      expect(isSensible(makeData([dateBreakout], [["2024-01-01"]]))).toBe(
        false,
      );
    });

    it("returns false with more than one date column", () => {
      const otherDate = createMockDatetimeColumn({
        name: "Updated At",
        display_name: "Updated At",
        source: "breakout",
      });

      expect(
        isSensible(
          makeData(
            [dateBreakout, otherDate, countAggregation],
            [
              ["2024-01-01", "2024-01-02", 10],
              ["2024-02-01", "2024-02-02", 20],
            ],
          ),
        ),
      ).toBe(false);
    });
  });

  describe("checkRenderable", () => {
    const settings = { "scalar.field": "Count" };

    it("does not throw for a GUI timeseries without insights", () => {
      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries([dateBreakout, countAggregation]),
          settings,
        ),
      ).not.toThrow();
    });

    it("does not throw for a native timeseries without insights", () => {
      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries([nativeDate, nativeCount]),
          { "scalar.field": "count" },
        ),
      ).not.toThrow();
    });

    it("does not throw with an extra dimension", () => {
      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries(
            [dateBreakout, categoryBreakout, countAggregation],
            [
              ["2024-01-01", "A", 10],
              ["2024-02-01", "B", 20],
            ],
          ),
          settings,
        ),
      ).not.toThrow();
    });

    it("does not throw with more than one date column", () => {
      const otherDate = createMockDatetimeColumn({
        name: "Updated At",
        display_name: "Updated At",
        source: "breakout",
      });

      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries(
            [dateBreakout, otherDate, countAggregation],
            [
              ["2024-01-01", "2024-01-02", 10],
              ["2024-02-01", "2024-02-02", 20],
            ],
          ),
          settings,
        ),
      ).not.toThrow();
    });

    it("does not throw for empty rows", () => {
      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries([dateBreakout, countAggregation], []),
          settings,
        ),
      ).not.toThrow();
    });

    it("throws when there is no date column", () => {
      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries(
            [categoryBreakout, countAggregation],
            [
              ["A", 10],
              ["B", 20],
            ],
          ),
          settings,
        ),
      ).toThrow(
        new ChartSettingsError(
          "Group only by a time field to see how this has changed over time",
        ),
      );
    });

    it("throws when scalar.field is missing from the result columns", () => {
      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries([dateBreakout, countAggregation]),
          { "scalar.field": "Missing" },
        ),
      ).toThrow(
        new ChartSettingsError(
          "Add a metric to see how it's changed over time",
        ),
      );
    });

    it("throws when scalar.field is unset", () => {
      expect(() =>
        SMART_SCALAR_CHART_DEFINITION.checkRenderable(
          makeSeries([dateBreakout, countAggregation]),
          {},
        ),
      ).toThrow(
        new ChartSettingsError(
          "Add a metric to see how it's changed over time",
        ),
      );
    });
  });
});
