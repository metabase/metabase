import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import {
  getBreakoutCardinality,
  validateBreakoutSeriesCount,
} from "./validation";

const SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["dim", "breakout"],
  "graph.metrics": ["metric"],
};

const buildSeriesWithBreakoutCardinality = (cardinality: number): Series => {
  const cols = [
    createMockColumn({ name: "dim", base_type: "type/Text" }),
    createMockColumn({ name: "breakout", base_type: "type/Integer" }),
    createMockColumn({ name: "metric", base_type: "type/Integer" }),
  ];
  const rows = Array.from({ length: cardinality }, (_value, index) => [
    "2023-01-01",
    index,
    1,
  ]);

  return [
    createMockSingleSeries({}, { data: createMockDatasetData({ cols, rows }) }),
  ];
};

describe("visualizations > lib > settings > validation", () => {
  describe("getBreakoutCardinality", () => {
    it("counts distinct breakout values", () => {
      const [{ data }] = buildSeriesWithBreakoutCardinality(37);
      expect(getBreakoutCardinality(data.cols, data.rows, SETTINGS)).toBe(37);
    });
  });

  describe("validateBreakoutSeriesCount", () => {
    // Regression guard for metabase#28796: the limit is MAX_SERIES (100),
    // not the old hardcoded 20.
    it("allows a breakout with exactly MAX_SERIES series", () => {
      expect(MAX_SERIES).toBe(100);
      const series = buildSeriesWithBreakoutCardinality(MAX_SERIES);
      expect(() => validateBreakoutSeriesCount(series, SETTINGS)).not.toThrow();
    });

    it("allows a breakout with more than the old 20-series limit", () => {
      const series = buildSeriesWithBreakoutCardinality(50);
      expect(() => validateBreakoutSeriesCount(series, SETTINGS)).not.toThrow();
    });

    it("throws once the breakout exceeds MAX_SERIES", () => {
      const series = buildSeriesWithBreakoutCardinality(MAX_SERIES + 1);
      expect(() => validateBreakoutSeriesCount(series, SETTINGS)).toThrow(
        "This chart type doesn't support more than 100 series of data.",
      );
    });
  });
});
