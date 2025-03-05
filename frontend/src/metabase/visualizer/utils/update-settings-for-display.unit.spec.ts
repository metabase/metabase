import registerVisualizations from "metabase/visualizations/register";
import { createMockColumn } from "metabase-types/api/mocks";
import type { VisualizerColumnValueSource } from "metabase-types/store/visualizer";

import { updateSettingsForDisplay } from "./update-settings-for-display";

registerVisualizations();

describe("updateSettingsForDisplay", () => {
  const columnValuesMapping = {
    COLUMN_1: [
      { sourceId: "card:45", originalName: "CREATED_AT", name: "COLUMN_1" },
    ],
    COLUMN_2: [
      { sourceId: "card:45", originalName: "count", name: "COLUMN_2" },
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
      display_name: "Count",
      semantic_type: "type/Quantity",
      field_ref: ["field", "COLUMN_2", { "base-type": "type/BigInteger" }],
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
      name: "COLUMN_2",
    }),
  ];

  it("should return the same settings if sourceDisplay or targetDisplay is null", () => {
    const settings = {};
    const sourceDisplay = null;
    const targetDisplay = null;
    const result = updateSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      sourceDisplay,
      targetDisplay,
    );
    expect(result).toEqual({ columnValuesMapping, columns, settings });
  });

  it("should return the same settings if sourceDisplay and targetDisplay are cartesian", () => {
    const settings = {};
    const sourceDisplay = "bar";
    const targetDisplay = "bar";
    const result = updateSettingsForDisplay(
      columnValuesMapping,
      columns,
      settings,
      sourceDisplay,
      targetDisplay,
    );
    expect(result).toEqual({ columnValuesMapping, columns, settings });
  });

  it("should work if sourceDisplay is cartesian and targetDisplay is pie", () => {
    const settings = {
      "graph.metrics": ["COLUMN_2"],
      "graph.dimensions": ["COLUMN_1"],
    };
    const sourceDisplay = "line";
    const targetDisplay = "pie";
    const result = updateSettingsForDisplay(
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
        "pie.metric": "COLUMN_2",
        "pie.dimension": "COLUMN_1",
      },
    });
  });

  it("should remove unnecessary columns if sourceDisplay is cartesian and targetDisplay is pie", () => {
    const settings = {
      "graph.metrics": ["COLUMN_2"],
      "graph.dimensions": ["COLUMN_1"],
    };
    const sourceDisplay = "line";
    const targetDisplay = "pie";
    const result = updateSettingsForDisplay(
      {
        ...columnValuesMapping,
        COLUMN_3: [
          { sourceId: "card:45", originalName: "category", name: "COLUMN_3" },
        ],
      },
      [
        ...columns,
        createMockColumn({ name: "COLUMN_3", display_name: "Category" }),
      ],
      settings,
      sourceDisplay,
      targetDisplay,
    );
    expect(result).toEqual({
      columnValuesMapping,
      columns,
      settings: {
        "pie.metric": "COLUMN_2",
        "pie.dimension": "COLUMN_1",
      },
    });
  });

  it("should work if sourceDisplay is pie and targetDisplay is cartesian", () => {
    const settings = {
      "pie.metric": "COLUMN_2",
      "pie.dimension": "COLUMN_1",
    };
    const sourceDisplay = "pie";
    const targetDisplay = "line";
    const result = updateSettingsForDisplay(
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
        "graph.metrics": ["COLUMN_2"],
        "graph.dimensions": ["COLUMN_1"],
      },
    });
  });
});
