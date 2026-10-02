import type { ClickObject } from "metabase/visualizations/types";
import {
  createMockColumn,
  createMockDatetimeColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import {
  getClickContext,
  getDateFilterOperation,
  getDrillOperation,
  isStayDrill,
} from "./derive";

const DATE = createMockDatetimeColumn({ name: "CREATED_AT" });
const COUNT = createMockNumericColumn({ name: "count" });

const POINT: ClickObject = {
  column: COUNT,
  value: 26000,
  dimensions: [{ column: DATE, value: "2024-01-01T00:00:00Z" }],
  data: [
    { col: DATE, value: "2024-01-01T00:00:00Z" },
    { col: COUNT, value: 26000 },
  ],
};

describe("getClickContext", () => {
  it("names each clicked column by its result-column name", () => {
    expect(getClickContext(POINT)).toEqual({
      column: "count",
      value: 26000,
      dimensions: [{ column: "CREATED_AT", value: "2024-01-01T00:00:00Z" }],
      row: [
        { column: "CREATED_AT", value: "2024-01-01T00:00:00Z" },
        { column: "count", value: 26000 },
      ],
    });
  });

  it("leaves the value out for a header click and keeps a SQL NULL as null", () => {
    expect(getClickContext({ column: COUNT })).not.toHaveProperty("value");
    expect(getClickContext({ column: COUNT, value: null })?.value).toBeNull();
  });

  it("refuses a value that is not a scalar", () => {
    expect(
      getClickContext({
        column: createMockColumn({ name: "JSON" }),
        value: { a: 1 },
      }),
    ).toBeNull();
  });
});

describe("getDrillOperation", () => {
  it.each([
    ["sort.ascending", { drill: "sort", direction: "asc" }],
    ["sort.descending", { drill: "sort", direction: "desc" }],
    ["quick-filter.<", { drill: "quick-filter", operator: "<" }],
    ["summarize-column.sum", { drill: "summarize-column", aggregation: "sum" }],
    ["zoom-in.timeseries", { drill: "zoom-in.timeseries" }],
    ["underlying-records", { drill: "underlying-records" }],
  ])("maps the %s action to its drill", (actionName, expected) => {
    expect(getDrillOperation(actionName, POINT)).toEqual({
      type: "drill-thru",
      context: getClickContext(POINT),
      ...expected,
    });
  });

  it.each(["column-filter", "breakout-by", "extract", "combine"])(
    "has no operation for the %s action, which builds a query on the client",
    (actionName) => {
      expect(getDrillOperation(actionName, POINT)).toBeNull();
    },
  );
});

describe("isStayDrill", () => {
  it("keeps sorts and zooms in place and hands other drills to the agent", () => {
    const sort = getDrillOperation("sort.ascending", POINT);
    const records = getDrillOperation("underlying-records", POINT);

    expect(sort && isStayDrill(sort)).toBe(true);
    expect(records && isStayDrill(records)).toBe(false);
  });
});

describe("getDateFilterOperation", () => {
  it("sends specific dates as zone-less ISO strings", () => {
    expect(
      getDateFilterOperation({
        type: "specific",
        operator: "between",
        values: [new Date(2024, 0, 1), new Date(2024, 5, 30)],
        hasTime: false,
      }),
    ).toEqual({
      type: "date-filter/set",
      value: {
        type: "specific",
        operator: "between",
        values: ["2024-01-01", "2024-06-30"],
        hasTime: false,
      },
    });
  });

  it("sends a relative filter with its options", () => {
    expect(
      getDateFilterOperation({
        type: "relative",
        unit: "day",
        value: -30,
        options: { includeCurrent: true },
      }),
    ).toEqual({
      type: "date-filter/set",
      value: {
        type: "relative",
        unit: "day",
        value: -30,
        offsetUnit: null,
        offsetValue: null,
        options: { includeCurrent: true },
      },
    });
  });
});
