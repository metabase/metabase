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
  {
    name: "aggregation-3",
    display_name: "aggregation-3",
    source: "aggregation",
    field_ref: ["aggregation", 3],
  },
  {
    name: "aggregation-4",
    display_name: "aggregation-4",
    source: "aggregation",
    field_ref: ["aggregation", 4],
  },
  {
    name: "aggregation-5",
    display_name: "aggregation-5",
    source: "aggregation",
    field_ref: ["aggregation", 5],
  },
  {
    name: "aggregation-6",
    display_name: "aggregation-6",
    source: "aggregation",
    field_ref: ["aggregation", 6],
  },
];

const rows = [
  ["foo1", "bar1", "baz1", 0, 111, 222, 100, 100, 100, 100],
  ["foo1", "bar1", "baz2", 0, 777, 888, 2000, 2000, 2000, 2000],
  ["foo2", "bar2", "baz2", 0, 333, 444, 30000, 30000, 30000, 30000],
  ["foo3", "bar3", "baz3", 0, 555, 666, 400000, 400000, 400000, 400000],
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
    values: [
      cols[4].name,
      cols[5].name,
      cols[6].name,
      cols[7].name,
      cols[8].name,
      cols[9].name,
    ],
  },
  "table.column_formatting": [],
  column_settings: {},
};

export const PIVOT_3_ROWS_NO_COLUMNS = {
  data: {
    cols,
    rows,
  },
  initialSettings: {
    ...pivotSettings,
    column: (c: any) => ({
      ...pivotSettings,
      column: c,
      column_title: c.display_name,
    }),
  },
};
