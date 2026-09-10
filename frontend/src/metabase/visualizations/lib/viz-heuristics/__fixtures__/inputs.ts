// Plain-data inputs shared by all heuristic tests. No query: these exercise
// the column/row paths; variant specs build real queries where they need them.
import type { DatasetColumn, RowValues } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import type { VizInput } from "../types";

const countColumn = (): DatasetColumn =>
  createMockColumn({
    name: "count",
    display_name: "Count",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: "type/Quantity",
    source: "aggregation",
  });

const breakoutColumn = (overrides: Partial<DatasetColumn>): DatasetColumn =>
  createMockColumn({ source: "breakout", ...overrides });

const TIME_ROWS: RowValues[] = [
  ["2024-01-01T00:00:00Z", 10],
  ["2024-02-01T00:00:00Z", 12],
  ["2024-03-01T00:00:00Z", 9],
];

export const ONE_BY_ONE_COUNT: VizInput = {
  cols: [countColumn()],
  rows: [[42]],
  query: null,
  dimensionType: "scalar",
  context: "harness",
};

export const TIME_SERIES: VizInput = {
  cols: [
    breakoutColumn({
      name: "CREATED_AT",
      display_name: "Created At: Month",
      base_type: "type/DateTime",
      effective_type: "type/DateTime",
      unit: "month",
    }),
    countColumn(),
  ],
  rows: TIME_ROWS,
  query: null,
  dimensionType: "time",
  context: "harness",
};

export const CATEGORY_BAR: VizInput = {
  cols: [
    breakoutColumn({
      name: "CATEGORY",
      display_name: "Category",
      base_type: "type/Text",
      effective_type: "type/Text",
      semantic_type: "type/Category",
    }),
    countColumn(),
  ],
  rows: [
    ["Widget", 20],
    ["Gadget", 15],
    ["Gizmo", 7],
  ],
  query: null,
  dimensionType: "category",
  context: "harness",
};

export const GEO_STATE: VizInput = {
  cols: [
    breakoutColumn({
      name: "STATE",
      display_name: "State",
      base_type: "type/Text",
      effective_type: "type/Text",
      semantic_type: "type/State",
    }),
    countColumn(),
  ],
  rows: [
    ["CA", 30],
    ["TX", 22],
    ["NY", 18],
  ],
  query: null,
  dimensionType: "geo",
  context: "harness",
};

export const NUMERIC: VizInput = {
  cols: [
    breakoutColumn({
      name: "QUANTITY",
      display_name: "Quantity: 10 bins",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      binning_info: { binning_strategy: "num-bins", num_bins: 10 },
    }),
    countColumn(),
  ],
  rows: [
    [0, 5],
    [10, 8],
    [20, 3],
  ],
  query: null,
  dimensionType: "numeric",
  context: "harness",
};

export const LENS_HINT: VizInput = {
  cols: [
    breakoutColumn({
      name: "STATUS",
      display_name: "Status",
      base_type: "type/Text",
      effective_type: "type/Text",
    }),
    countColumn(),
  ],
  rows: [
    ["open", 100],
    ["closed", 60],
  ],
  query: null,
  hint: { display: "row", settings: { "graph.x_axis.labels_enabled": false } },
  context: "lens",
};

export const ALLOWED_RESTRICTION: VizInput = {
  ...TIME_SERIES,
  hint: { display: "line" },
  allowed: ["bar", "area"],
  context: "metric-grid",
};

export const FIXTURE_INPUTS: Record<string, VizInput> = {
  "1×1 count": ONE_BY_ONE_COUNT,
  "time series": TIME_SERIES,
  "category bar": CATEGORY_BAR,
  "geo state": GEO_STATE,
  numeric: NUMERIC,
  "lens hint": LENS_HINT,
  "allowed restriction": ALLOWED_RESTRICTION,
};
