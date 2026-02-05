import registerVisualizations from "metabase/visualizations/register";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { groupVisualizationsBySensibility } from "./sensibility-grouping";

registerVisualizations();

const makeCol = (overrides: Record<string, unknown> = {}) =>
  createMockColumn({
    name: "col",
    display_name: "Col",
    source: "native",
    base_type: "type/Text",
    effective_type: "type/Text",
    ...overrides,
  });

const breakoutCol = (overrides: Record<string, unknown> = {}) =>
  makeCol({ source: "breakout", ...overrides });

const aggregationCol = (overrides: Record<string, unknown> = {}) =>
  makeCol({
    source: "aggregation",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    ...overrides,
  });

const dateBreakoutCol = (overrides: Record<string, unknown> = {}) =>
  breakoutCol({
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    ...overrides,
  });

describe("groupVisualizationsBySensibility", () => {
  const datetimeData = createMockDatasetData({
    cols: [dateBreakoutCol({ name: "created_at" }), aggregationCol()],
    rows: [
      ["2024-01", 100],
      ["2024-02", 200],
    ],
  });

  it("partitions viz types into groups based on getSensibility", () => {
    const result = groupVisualizationsBySensibility({
      orderedVizTypes: ["bar", "line", "table"],
      data: datetimeData,
    });

    expect(result.recommended).toContain("bar");
    expect(result.recommended).toContain("line");
    expect(result.recommended).toContain("table");
    expect(result.nonsensible).toEqual([]);
  });

  it("caps recommended at 12 and overflows to sensible", () => {
    const manyVizTypes = [
      "table",
      "bar",
      "line",
      "pie",
      "row",
      "area",
      "combo",
      "pivot",
      "scatter",
      "waterfall",
      "smartscalar",
      "map",
      "object",
    ] as const;

    const result = groupVisualizationsBySensibility({
      orderedVizTypes: [...manyVizTypes],
      data: datetimeData,
    });

    expect(result.recommended.length).toBeLessThanOrEqual(12);
    expect(
      result.recommended.length +
        result.sensible.length +
        result.nonsensible.length,
    ).toBe(manyVizTypes.length);
  });

  it("preserves order within each group", () => {
    const ordered = ["table", "bar", "line", "object", "pie"] as const;

    const result = groupVisualizationsBySensibility({
      orderedVizTypes: [...ordered],
      data: datetimeData,
    });

    const recIndices = result.recommended.map(v =>
      ordered.indexOf(v as (typeof ordered)[number]),
    );
    for (let i = 1; i < recIndices.length; i++) {
      expect(recIndices[i]).toBeGreaterThan(recIndices[i - 1]);
    }
  });

  describe("dataset shapes", () => {
    const scalarData = createMockDatasetData({
      cols: [aggregationCol()],
      rows: [[42]],
    });

    it("recommends scalar/progress/gauge for scalar datasets", () => {
      const result = groupVisualizationsBySensibility({
        orderedVizTypes: ["scalar", "progress", "gauge", "bar", "line"],
        data: scalarData,
      });

      expect(result.recommended).toContain("scalar");
      expect(result.recommended).toContain("progress");
      expect(result.recommended).toContain("gauge");
      expect(result.recommended).not.toContain("bar");
      expect(result.recommended).not.toContain("line");
    });

    it("recommends table/object for unaggregated datasets", () => {
      const unaggData = createMockDatasetData({
        cols: [
          makeCol({ name: "id", source: "fields" }),
          makeCol({ name: "name", source: "fields" }),
        ],
        rows: [
          [1, "Alice"],
          [2, "Bob"],
        ],
      });

      const result = groupVisualizationsBySensibility({
        orderedVizTypes: ["table", "object", "bar", "scatter"],
        data: unaggData,
      });

      expect(result.recommended).toContain("table");
      expect(result.recommended).toContain("object");
      expect(result.recommended).not.toContain("bar");
      expect(result.recommended).not.toContain("scatter");
    });
  });
});
