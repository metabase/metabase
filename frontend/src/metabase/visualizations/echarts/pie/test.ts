/* istanbul ignore file */
import { createMockCard } from "metabase-types/api/mocks";
import type { RawSeries } from "metabase-types/api";

const MOCK_COLS = [
  {
    name: "CATEGORY",
    source: "breakout",
    display_name: "Category",
  },
  {
    name: "count",
    display_name: "Count",
    source: "aggregation",
    effective_type: "type/BigInteger",
  },
];

const MOCK_ROWS = [
  ["Doohickey", 42],
  ["Gadget", 53],
  ["Gizmo", 51],
  ["Widget", 54],
];

export const MOCK_RAW_SERIES: RawSeries = [
  {
    card: createMockCard(),
    data: {
      cols: MOCK_COLS,
      rows: MOCK_ROWS,
      rows_truncated: 0,
      results_metadata: {
        columns: MOCK_COLS,
      },
    },
  },
];

export const DEFAULT_SETTINGS = {
  "pie.dimension": "CATEGORY",
  "pie.metric": "count",
  "pie.show_legend": true,
  "pie.show_total": true,
  "pie.percent_visibility": "legend",
  "pie.slice_threshold": 2.5,
  "pie.colors": {
    Doohickey: "#88BF4D",
    Gadget: "#F9D45C",
    Gizmo: "#A989C5",
    Widget: "#F2A86F",
  },
};
