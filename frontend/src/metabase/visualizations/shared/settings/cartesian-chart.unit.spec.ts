import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { getDefaultColumns } from "./cartesian-chart";

const COLS = [
  createMockColumn({
    database_type: "NUMERIC",
    semantic_type: "type/Quantity",
    table_id: 2,
    binning_info: {
      binning_strategy: "num-bins",
      min_value: 0,
      max_value: 100,
      num_bins: 8,
      bin_width: 12.5,
    },
    name: "QUANTITY",
    source: "fields",
    field_ref: ["field", 2, null],
    effective_type: "type/Decimal",
    active: true,
    id: 2,
    visibility_type: "normal",
    display_name: "Quantity: 8 bins",
    base_type: "type/Decimal",
  }),
  createMockColumn({
    database_type: "BIGINT",
    semantic_type: "type/Quantity",
    name: "count",
    source: "fields",
    field_ref: [
      "field",
      "count",
      {
        "base-type": "type/BigInteger",
      },
    ],
    effective_type: "type/BigInteger",
    display_name: "Count",
    base_type: "type/BigInteger",
  }),
];

const mockSeries = [
  createMockSingleSeries(
    {
      display: "bar",
      visualization_settings: {},
      type: "question",
    },
    {
      row_count: 5,
      context: "ad-hoc",
      data: {
        rows: [
          [0, 18587],
          [12.5, 52],
          [25, 49],
          [37.5, 29],
          [50, 22],
        ],
        cols: COLS,
      },
    },
  ),
];

describe("getDefaultColumns", () => {
  it("should return valid dimension", () => {
    expect(getDefaultColumns(mockSeries)).toEqual({
      dimensions: ["QUANTITY"],
      metrics: ["count"],
    });
  });
});
