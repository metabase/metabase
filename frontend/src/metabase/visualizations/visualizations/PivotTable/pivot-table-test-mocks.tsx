import { useState } from "react";

import { Box } from "metabase/ui";
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { PivotTable } from "./PivotTable";

const cols = [
  {
    source: "breakout",
    field_ref: ["field", 123, null],
    display_name: "field-123",
    name: "field-123",
  },
  {
    source: "breakout",
    field_ref: ["field", 456, null],
    display_name: "field-456",
    name: "field-456",
  },
  {
    source: "breakout",
    field_ref: ["field", 789, null],
    display_name: "field-789",
    name: "field-789",
  },
  {
    source: "breakout",
    field_ref: ["expression", "pivot-grouping"],
    name: "pivot-grouping",
    display_name: "pivot-grouping",
  },
  {
    source: "aggregation",
    field_ref: ["aggregation", 1],
    display_name: "aggregation-1",
  },
  {
    source: "aggregation",
    field_ref: ["aggregation", 2],
    display_name: "aggregation-2",
  },
] as DatasetColumn[];

const rows = [
  ["foo1", "bar1", "baz1", 0, 111, 222],
  ["foo1", "bar1", "baz2", 0, 777, 888],
  ["foo2", "bar2", "baz2", 0, 333, 444],
  ["foo3", "bar3", "baz3", 0, 555, 666],
];

const pivotSettings = {
  "pivot.show_column_totals": true,
  "pivot.show_row_totals": true,
  "pivot_table.collapsed_rows": {
    rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
    value: [],
  },
  "pivot_table.column_split": {
    columns: [],
    rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
    values: [cols[4].field_ref, cols[5].field_ref],
  },
  "table.column_formatting": [],
  column_settings: {},
};

const settings = {
  ...pivotSettings,
  column: (c: any) => ({
    ...pivotSettings,
    column: c,
    column_title: c.display_name,
  }),
} as unknown as VisualizationSettings;

export const PIVOT_TABLE_MOCK_DATA = { rows, cols, settings };

/**
 * Mock wrapper for PivotTable for use in unit tests and stories.
 */
export function PivotTableTestWrapper(props?: any) {
  const [vizSettings, setVizSettings] = useState(
    props.initialSettings ?? settings,
  );

  return (
    <Box h="400px">
      <PivotTable
        settings={vizSettings}
        data={{ rows, cols }}
        width={600}
        height={400}
        onVisualizationClick={() => {}}
        onUpdateVisualizationSettings={newSettings =>
          setVizSettings({ ...vizSettings, ...newSettings })
        }
        isNightMode={false}
        isDashboard={false}
        {...props}
      />
    </Box>
  );
}
