import registerVisualizations from "metabase/visualizations/register";
import { createMockColumn } from "metabase-types/api/mocks";
import type { VisualizerColumnValueSource } from "metabase-types/store/visualizer";

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
    createMockColumn({
      semantic_type: "type/CreationTimestamp",
      name: "COLUMN_1",
      field_ref: [
        "field",
        "COLUMN_1",
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
      effective_type: "type/DateTime",
      id: 13,
      display_name: "Created At: Month",
      base_type: "type/DateTime",
    }),
    createMockColumn({
      display_name: "Category",
      semantic_type: "type/Category",
      field_ref: ["field", "COLUMN_2", { "base-type": "type/Text" }],
      base_type: "type/Text",
      effective_type: "type/Text",
      name: "COLUMN_2",
    }),
    createMockColumn({
      display_name: "Count",
      semantic_type: "type/Quantity",
      field_ref: ["field", "COLUMN_2", { "base-type": "type/BigInteger" }],
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
      name: "COLUMN_3",
    }),
  ];

  it("should return undefined if sourceDisplay or targetDisplay is null", () => {
    const settings = {};
    const sourceDisplay = null;
    const targetDisplay = null;
    const result = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      sourceDisplay,
      targetDisplay,
    );
    expect(result).toBeUndefined();
  });

  it("should return undefined if sourceDisplay and targetDisplay are cartesian", () => {
    const settings = {};
    const sourceDisplay = "bar";
    const targetDisplay = "bar";
    const result = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      sourceDisplay,
      targetDisplay,
    );
    expect(result).toBeUndefined();
  });

  describe("cartesian -> pie", () => {
    it("should work with a single dimension (and remove extraneous columns)", () => {
      const settings = {
        "graph.metrics": ["COLUMN_3"],
        "graph.dimensions": ["COLUMN_1"],
      };
      const sourceDisplay = "line";
      const targetDisplay = "pie";
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        settings,
        sourceDisplay,
        targetDisplay,
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
      const settings = {
        "graph.metrics": ["COLUMN_3"],
        "graph.dimensions": ["COLUMN_1", "COLUMN_2"],
      };
      const sourceDisplay = "line";
      const targetDisplay = "pie";
      const result = getUpdatedSettingsForDisplay(
        columnValuesMapping,
        columns,
        settings,
        sourceDisplay,
        targetDisplay,
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

  it("should work if sourceDisplay is pie and targetDisplay is cartesian", () => {
    const settings = {
      "pie.metric": "COLUMN_3",
      "pie.dimension": "COLUMN_1",
    };
    const sourceDisplay = "pie";
    const targetDisplay = "line";
    const result = getUpdatedSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      sourceDisplay,
      targetDisplay,
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
