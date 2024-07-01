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
  {
    source: "aggregation",
    field_ref: ["aggregation", 3],
    display_name: "aggregation-3",
  },
  {
    source: "aggregation",
    field_ref: ["aggregation", 4],
    display_name: "aggregation-4",
  },
  {
    source: "aggregation",
    field_ref: ["aggregation", 5],
    display_name: "aggregation-5",
  },
  {
    source: "aggregation",
    field_ref: ["aggregation", 6],
    display_name: "aggregation-6",
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
    rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
    value: [],
  },
  "pivot_table.column_split": {
    columns: [],
    rows: [cols[0].field_ref, cols[1].field_ref, cols[2].field_ref],
    values: [
      cols[4].field_ref,
      cols[5].field_ref,
      cols[6].field_ref,
      cols[7].field_ref,
      cols[8].field_ref,
      cols[9].field_ref,
    ],
  },
  "table.column_formatting": [],
  column_settings: {},
};

export const HORIZONTAL_SCROLL_43215 = {
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
