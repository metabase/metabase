import registerVisualizations from "metabase/visualizations/register";
import type { VisualizerColumnValueSource } from "metabase-types/api";
import {
  createMockCategoryColumn,
  createMockDatetimeColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { createDataSourceNameRef } from "./data-source";
import { getUpdatedSettingsForDisplay } from "./get-updated-settings-for-display";

registerVisualizations();

describe("updateSettingsForDisplay", () => {
  const columnValuesMapping = {
    COLUMN_1: [
      { sourceId: "card:45", originalName: "CREATED_AT", name: "COLUMN_1" },
    ],
    COLUMN_2: [
      { sourceId: "card:45", originalName: "category", name: "COLUMN_2" },
    ],
    COLUMN_3: [
      { sourceId: "card:45", originalName: "count", name: "COLUMN_3" },
    ],
  } as Record<string, VisualizerColumnValueSource[]>;

  const columns = [
    createMockDatetimeColumn({
      id: 1,
      name: "COLUMN_1",
      display_name: "Created At: Month",
    }),
    createMockCategoryColumn({
      id: 2,
      name: "COLUMN_2",
      display_name: "Category",
    }),
    createMockNumericColumn({
      id: 3,
      name: "COLUMN_3",
      display_name: "Count",
    }),
  ];

  it("should return undefined if sourceDisplay or targetDisplay are null", () => {
    const settings = {};
    const result = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      null,
      null,
    );
    expect(result).toBeUndefined();
  });

  it("should return undefined if sourceDisplay and targetDisplay are the same", () => {
    const settings = {};
    const result = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      "bar",
      "bar",
    );
    expect(result).toBeUndefined();
  });

  it("should work if sourceDisplay and targetDisplay are cartesian", () => {
    const settings = {};
    const result = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      "bar",
      "line",
    );
    expect(result).toBeUndefined();
  });

  it("should preserve otherSettings such as goal line (VIZ-1206)", () => {
    const settings = {
      "graph.metrics": ["COLUMN_3"],
      "graph.dimensions": ["COLUMN_1", "COLUMN_2"],
      "card.title": "My viz",
      "goal.line": 100,
    };
    const lineToPieResult = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      "line",
      "pie",
    );

    expect(lineToPieResult).toEqual({
      columnValuesMapping,
      columns,
      settings: {
        "card.title": "My viz",
        "goal.line": 100,
        "pie.metric": "COLUMN_3",
        "pie.dimension": ["COLUMN_1", "COLUMN_2"],
      },
    });

    const lineToFunnelResult = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      "line",
      "funnel",
    );

    expect(lineToFunnelResult).toEqual({
      columnValuesMapping,
      columns,
      settings: {
        "card.title": "My viz",
        "funnel.dimension": "COLUMN_1",
        "funnel.metric": "COLUMN_3",
        "goal.line": 100,
        "graph.dimensions": ["COLUMN_1", "COLUMN_2"],
        "graph.metrics": ["COLUMN_3"],
      },
    });
  });

  describe("cartesian → cartesian", () => {
    it("should keep current state", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "graph.metrics": ["COLUMN_1", "COLUMN_3"],
          "graph.dimensions": ["COLUMN_2"],
        },
        "line",
        "bar",
      );
      expect(result).toBeUndefined();
    });
  });

  describe("cartesian -> pie", () => {
    it("should work with a single dimension (and remove extraneous columns)", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "graph.metrics": ["COLUMN_3"],
          "graph.dimensions": ["COLUMN_1"],
        },
        "line",
        "pie",
      );
      expect(result).toEqual({
        columnValuesMapping: {
          COLUMN_1: columnValuesMapping.COLUMN_1,
          COLUMN_3: columnValuesMapping.COLUMN_3,
        },
        columns: [columns[0], columns[2]],
        settings: {
          "pie.metric": "COLUMN_3",
          "pie.dimension": "COLUMN_1",
        },
      });
    });

    it("should work with multiple dimensions", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "graph.metrics": ["COLUMN_3"],
          "graph.dimensions": ["COLUMN_1", "COLUMN_2"],
        },
        "line",
        "pie",
      );
      expect(result).toEqual({
        columnValuesMapping,
        columns,
        settings: {
          "pie.metric": "COLUMN_3",
          "pie.dimension": ["COLUMN_1", "COLUMN_2"],
        },
      });
    });
  });

  describe("pie → cartesian", () => {
    it("should turn pie metric and dimensions settings into cartesian ones", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "pie.metric": "COLUMN_3",
          "pie.dimension": ["COLUMN_1", "COLUMN_2"],
        },
        "pie",
        "line",
      );
      expect(result).toEqual({
        columnValuesMapping,
        columns,
        settings: {
          "graph.metrics": ["COLUMN_3"],
          "graph.dimensions": ["COLUMN_1", "COLUMN_2"],
        },
      });
    });

    it("should work with a single pie dimension", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "pie.metric": "COLUMN_3",
          "pie.dimension": "COLUMN_1",
        },
        "pie",
        "line",
      );
      expect(result).toEqual({
        columnValuesMapping,
        columns,
        settings: {
          "graph.metrics": ["COLUMN_3"],
          "graph.dimensions": ["COLUMN_1"],
        },
      });
    });
  });

  describe("funnel → cartesian", () => {
    it("should turn funnel metric and dimension settings into cartesian ones", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "funnel.metric": "COLUMN_3",
          "funnel.dimension": "COLUMN_2",
        },
        "funnel",
        "line",
      );
      expect(result).toEqual({
        columnValuesMapping,
        columns,
        settings: {
          "graph.metrics": ["COLUMN_3"],
          "graph.dimensions": ["COLUMN_2"],
        },
      });
    });

    it("should ignore preserved columns that have been removed in the meantime (VIZ-1204)", () => {
      const preservedMetrics = ["COLUMN_1", "COLUMN_3"];
      const preservedDimensions = ["COLUMN_2"];

      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "funnel.metric": "COLUMN_3",
          "funnel.dimension": "COLUMN_2",
          "graph.metrics": preservedMetrics,
          "graph.dimensions": preservedDimensions,
        },
        "funnel",
        "line",
      );
      expect(result).toEqual({
        columnValuesMapping,
        columns,
        settings: {
          "graph.metrics": ["COLUMN_3"],
          "graph.dimensions": ["COLUMN_2"],
        },
      });
    });
  });

  describe("funnel → pie", () => {
    it("should turn funnel metric and dimensions settings into pie ones", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "funnel.metric": "COLUMN_3",
          "funnel.dimension": "COLUMN_2",
        },
        "funnel",
        "pie",
      );
      expect(result).toEqual({
        columnValuesMapping,
        columns,
        settings: {
          "pie.metric": "COLUMN_3",
          "pie.dimension": "COLUMN_2",
        },
      });
    });
  });

  describe("pie → funnel", () => {
    it("should work when a pie has an array of dimensions (VIZ-1205)", () => {
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        {
          "pie.metric": "COLUMN_3",
          "pie.dimension": ["COLUMN_2"],
        },
        "pie",
        "funnel",
      );
      expect(result).toEqual({
        columnValuesMapping,
        columns,
        settings: {
          "funnel.metric": "COLUMN_3",
          "funnel.dimension": "COLUMN_2",
          "graph.metrics": ["COLUMN_3"],
          "graph.dimensions": ["COLUMN_2"],
        },
      });
    });
  });

  describe("funnel made of scalars", () => {
    it("should reset state when changing to any other display type", () => {
      const cleanState = {
        settings: { "card.title": "My viz" },
        columns: [],
        columnValuesMapping: {},
      };

      const columns = [
        createMockNumericColumn({ name: "METRIC", display_name: "METRIC" }),
        createMockCategoryColumn({
          name: "DIMENSION",
          display_name: "DIMENSION",
        }),
      ];
      const columnValuesMapping: Record<string, VisualizerColumnValueSource[]> =
        {
          METRIC: [
            { sourceId: "card:1", originalName: "views", name: "COLUMN_1" },
            { sourceId: "card:2", originalName: "checkout", name: "COLUMN_2" },
            { sourceId: "card:3", originalName: "done", name: "COLUMN_3" },
          ],
          DIMENSION: [
            createDataSourceNameRef("card:1"),
            createDataSourceNameRef("card:2"),
            createDataSourceNameRef("card:3"),
          ],
        };
      const settings = {
        "card.title": "My viz",
        "funnel.metric": "METRIC",
        "funnel.dimension": "DIMENSION",
      };

      let result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        settings,
        "funnel",
        "bar",
      );

      expect(result).toEqual(cleanState);

      result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        settings,
        "funnel",
        "pie",
      );

      expect(result).toEqual(cleanState);
    });
  });
});
