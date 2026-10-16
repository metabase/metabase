import type { DatasetData, RowValue } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import {
  FIRST_EVENT_ATTRIBUTE_ID,
  parseFunnelPathsResult,
} from "./first-events";

const COLUMNS = [
  "path_range",
  "step",
  "source",
  "target",
  "outcome",
  "first_event",
  "weight",
  "converted_weight",
];
const TRANSITION_RANGES = [
  { start: 1, end: 2 },
  { start: 2, end: 3 },
];

const createData = (rows: RowValue[][]): DatasetData => ({
  cols: COLUMNS.map((name) => createMockColumn({ name })),
  rows,
  native_form: { query: "" },
  rows_truncated: 0,
  results_metadata: { columns: [] },
});

const DATA = createData([
  [1, 1, "1. Pricing", "2. /docs", "Converted", "", 30, 0],
  [1, 1, "1. Pricing", "2. /docs", "Didn't convert", "", 70, 0],
  [1, 0, "", "", "", "/docs", 100, 30],
  [1, 0, "", "", "", "/blog", 50, 5],
  [2, 1, "1. Trial", "2. (converted)", "Converted", "", 20, 0],
  [2, 0, "", "", "", "/app", "40", "10"],
]);

describe("parseFunnelPathsResult", () => {
  it("counts people by what they did first, with a total per transition of everyone who did something", () => {
    const { counts } = parseFunnelPathsResult(DATA, TRANSITION_RANGES);

    expect(counts).toEqual([
      { transition: 1, conditions: [], reached: 150, converted: 35 },
      { transition: 2, conditions: [], reached: 40, converted: 10 },
      {
        transition: 1,
        conditions: [{ attributeId: FIRST_EVENT_ATTRIBUTE_ID, value: "/docs" }],
        reached: 100,
        converted: 30,
      },
      {
        transition: 1,
        conditions: [{ attributeId: FIRST_EVENT_ATTRIBUTE_ID, value: "/blog" }],
        reached: 50,
        converted: 5,
      },
      {
        transition: 2,
        conditions: [{ attributeId: FIRST_EVENT_ATTRIBUTE_ID, value: "/app" }],
        reached: 40,
        converted: 10,
      },
    ]);
  });

  it("gives each transition a chart of its own links, without the first-event columns", () => {
    const { charts } = parseFunnelPathsResult(DATA, TRANSITION_RANGES);

    expect(charts.get(1)?.cols.map(({ name }) => name)).toEqual([
      "path_range",
      "step",
      "source",
      "target",
      "outcome",
      "weight",
    ]);
    expect(charts.get(1)?.rows).toEqual([
      [1, 1, "1. Pricing", "2. /docs", "Converted", 30],
      [1, 1, "1. Pricing", "2. /docs", "Didn't convert", 70],
    ]);
    expect(charts.get(2)?.rows).toEqual([
      [2, 1, "1. Trial", "2. (converted)", "Converted", 20],
    ]);
  });
});
