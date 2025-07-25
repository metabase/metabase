import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { VisualizationSettings } from "metabase-types/api";

import {
  updateVizSettingsKeysWithRefs,
  updateVizSettingsWithRefs,
} from "./update-viz-settings-with-refs";

describe("updateVizSettingsKeysWithRefs", () => {
  it("should handle empty objects", () => {
    expect(updateVizSettingsKeysWithRefs({}, {})).toEqual({});
    expect(updateVizSettingsKeysWithRefs({}, { avg: "COLUMN_1" })).toEqual({});
  });

  it("should convert column names to references in keys", () => {
    const settings: VisualizationSettings = {
      colors: {
        avg: "#000",
        sum: "#fff",
      },
    };
    const columnsToRefs = { avg: "COLUMN_1", sum: "COLUMN_2" };

    const result = updateVizSettingsKeysWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      colors: {
        COLUMN_1: "#000",
        COLUMN_2: "#fff",
      },
    });
  });

  it("should handle nested objects", () => {
    const settings: VisualizationSettings = {
      series: {
        avg: {
          color: "#000",
        },
        sum: {
          color: "#fff",
        },
      },
    };
    const columnsToRefs = { avg: "COLUMN_1", sum: "COLUMN_2" };

    const result = updateVizSettingsKeysWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      series: {
        COLUMN_1: {
          color: "#000",
        },
        COLUMN_2: {
          color: "#fff",
        },
      },
    });
  });

  it("should handle arrays", () => {
    const settings: VisualizationSettings = {
      dimensions: [
        { name: "avg", color: "#000" },
        { name: "sum", color: "#fff" },
      ],
    };
    const columnsToRefs = { avg: "COLUMN_1", sum: "COLUMN_2" };

    const result = updateVizSettingsKeysWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      dimensions: [
        { name: "avg", color: "#000" },
        { name: "sum", color: "#fff" },
      ],
    });
  });

  it("should handle complex nested structure", () => {
    const settings: VisualizationSettings = {
      series_settings: {
        avg: { color: "#000", "line.style": "solid" },
        sum: { color: "#fff", "line.style": "dashed" },
        count: { color: "#f00" },
      },
      column_settings: {
        avg: { format: "number" },
        ['["name","avg"]']: { format: "currency" },
      },
      data: [
        { series: "avg", value: 10 },
        { series: "sum", value: 20 },
      ],
    };
    const columnsToRefs = {
      avg: "COLUMN_1",
      sum: "COLUMN_2",
      ['["name","avg"]']: "COLUMN_3",
    };

    const result = updateVizSettingsKeysWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      series_settings: {
        COLUMN_1: { color: "#000", "line.style": "solid" },
        COLUMN_2: { color: "#fff", "line.style": "dashed" },
        count: { color: "#f00" },
      },
      column_settings: {
        COLUMN_1: { format: "number" },
        COLUMN_3: { format: "currency" },
      },
      data: [
        { series: "avg", value: 10 },
        { series: "sum", value: 20 },
      ],
    });
  });

  it("should handle column reference in a deeper object path", () => {
    const settings: VisualizationSettings = {
      deep: {
        nested: {
          avg: { show: true },
          sum: { show: false },
        },
      },
    };
    const columnsToRefs = { avg: "COLUMN_1", sum: "COLUMN_2" };

    const result = updateVizSettingsKeysWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      deep: {
        nested: {
          COLUMN_1: { show: true },
          COLUMN_2: { show: false },
        },
      },
    });
  });

  it("should not modify original settings object", () => {
    const settings: VisualizationSettings = {
      colors: { avg: "#000" },
    };
    const columnsToRefs = { avg: "COLUMN_1" };

    updateVizSettingsKeysWithRefs(settings, columnsToRefs);

    expect(settings).toEqual({
      colors: { avg: "#000" },
    });
  });

  it("should handle empty columnsToRefs", () => {
    const settings: VisualizationSettings = {
      colors: { avg: "#000", sum: "#fff" },
    };

    const result = updateVizSettingsKeysWithRefs(settings, {});

    expect(result).toEqual({
      colors: { avg: "#000", sum: "#fff" },
    });
  });
});

describe("updateVizSettingsWithRefs", () => {
  it("should not modify graph.series_order_dimension when value is not in columnsToRefs", () => {
    const settings: VisualizationSettings = {
      "graph.series_order_dimension": "other_field",
      colors: { avg: "#000" },
    };
    const columnsToRefs = { avg: "COLUMN_1", sum: "COLUMN_2" };

    const result = updateVizSettingsWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      "graph.series_order_dimension": "other_field",
      colors: { COLUMN_1: "#000" },
    });
  });

  it("should update graph.series_order_dimension with column reference", () => {
    const settings: VisualizationSettings = {
      "graph.series_order_dimension": "avg",
      colors: { avg: "#000" },
    };
    const columnsToRefs = { avg: "COLUMN_1", sum: "COLUMN_2" };

    const result = updateVizSettingsWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      "graph.series_order_dimension": "COLUMN_1",
      colors: { COLUMN_1: "#000" },
    });
  });

  it("should not modify graph.tooltip_columns when value is not in columnsToRefs", () => {
    const settings: VisualizationSettings = {
      "graph.tooltip_columns": ["other_field"],
      colors: { avg: "#000" },
    };
    const columnsToRefs = { avg: "COLUMN_1", sum: "COLUMN_2" };

    const result = updateVizSettingsWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      "graph.tooltip_columns": ["other_field"],
      colors: { COLUMN_1: "#000" },
    });
  });

  it("should update graph.tooltip_columns with column references", () => {
    const settings: VisualizationSettings = {
      "graph.tooltip_columns": [
        getColumnKey({ name: "avg" }),
        getColumnKey({ name: "sum" }),
      ],
    };
    const columnsToRefs = {
      avg: "COLUMN_1",
      sum: "COLUMN_2",
    };

    const result = updateVizSettingsWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      "graph.tooltip_columns": [
        getColumnKey({ name: "COLUMN_1" }),
        getColumnKey({ name: "COLUMN_2" }),
      ],
    });
  });

  it("should handle getColumnKey names too", () => {
    const settings: VisualizationSettings = {
      "graph.x_axis.scale": "ordinal",
      "graph.dimensions": ["CATEGORY"],
      column_settings: {
        // v-- this key doesn't directly match a column name
        '["name","count"]': {
          number_style: "scientific",
          prefix: "Around ",
          suffix: "-ish",
        },
      },
      "graph.metrics": ["count"],
    };
    const columnsToRefs = {
      CATEGORY: "COLUMN_1",
      count: "COLUMN_2",
    };

    const result = updateVizSettingsWithRefs(settings, columnsToRefs);

    expect(result).toEqual({
      "graph.x_axis.scale": "ordinal",
      "graph.dimensions": ["CATEGORY"],
      column_settings: {
        '["name","COLUMN_2"]': {
          number_style: "scientific",
          prefix: "Around ",
          suffix: "-ish",
        },
      },
      "graph.metrics": ["count"],
    });
  });
});
