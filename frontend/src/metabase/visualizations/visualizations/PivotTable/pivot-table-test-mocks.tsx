import { useState } from "react";

import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

import { PivotTable } from "./PivotTable";

const cols = [
  {
    name: "field-123",
    display_name: "field-123",
    source: "breakout",
    field_ref: ["field", 123, null],
  },
  {
    name: "field-456",
    display_name: "field-456",
    source: "breakout",
    field_ref: ["field", 456, null],
  },
  {
    name: "field-789",
    display_name: "field-789",
    source: "breakout",
    field_ref: ["field", 789, null],
  },
  {
    name: "pivot-grouping",
    display_name: "pivot-grouping",
    source: "breakout",
    field_ref: ["expression", "pivot-grouping"],
  },
  {
    name: "aggregation-1",
    display_name: "aggregation-1",
    source: "aggregation",
    field_ref: ["aggregation", 1],
  },
  {
    name: "aggregation-2",
    display_name: "aggregation-2",
    source: "aggregation",
    field_ref: ["aggregation", 2],
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
    rows: [cols[0].name, cols[1].name, cols[2].name],
    value: [],
  },
  "pivot_table.column_split": {
    columns: [],
    rows: [cols[0].name, cols[1].name, cols[2].name],
    values: [cols[4].name, cols[5].name],
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
    <PivotTable
      settings={vizSettings}
      data={{ rows, cols }}
      onVisualizationClick={() => {}}
      onUpdateVisualizationSettings={newSettings =>
        setVizSettings({ ...vizSettings, ...newSettings })
      }
      isNightMode={false}
      isDashboard={false}
      {...props}
    />
  );
}
