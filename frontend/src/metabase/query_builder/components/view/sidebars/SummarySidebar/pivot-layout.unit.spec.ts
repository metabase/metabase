import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestAggregationSpec, TestBreakoutSpec } from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  getPivotLayout,
  getPivotLayoutAfterDrop,
  getPivotSplit,
  getWellItems,
} from "./pivot-layout";
import type { SummaryDimensionWellId, SummaryDragItem } from "./types";
import { getDimensionItems, getFieldSections } from "./utils";

const STAGE_INDEX = -1;

const CREATED_AT_YEAR: TestBreakoutSpec = {
  type: "column",
  name: "CREATED_AT",
  unit: "year",
};

const CREATED_AT_MONTH: TestBreakoutSpec = {
  type: "column",
  name: "CREATED_AT",
  unit: "month",
};

const CATEGORY: TestBreakoutSpec = {
  type: "column",
  sourceFieldId: ORDERS.PRODUCT_ID,
  name: "CATEGORY",
};

const VENDOR: TestBreakoutSpec = {
  type: "column",
  sourceFieldId: ORDERS.PRODUCT_ID,
  name: "VENDOR",
};

const COUNT: TestAggregationSpec = { type: "operator", operator: "count" };

const SUM_OF_TOTAL: TestAggregationSpec = {
  type: "operator",
  operator: "sum",
  args: [{ type: "column", name: "TOTAL" }],
};

function createQuery(
  breakouts: TestBreakoutSpec[],
  aggregations: TestAggregationSpec[] = [COUNT],
) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      { source: { type: "table", id: ORDERS_ID }, aggregations, breakouts },
    ],
  });
}

describe("getPivotLayout", () => {
  it("puts the groupings that are not in Rows in Columns, with every value", () => {
    const query = createQuery([CATEGORY, CREATED_AT_MONTH]);

    expect(
      getPivotLayout(query, STAGE_INDEX, {
        rows: ["CREATED_AT"],
        columns: [],
        values: [],
      }),
    ).toEqual({
      rows: ["CREATED_AT"],
      columns: ["CATEGORY"],
      values: ["count"],
    });
  });

  it("keeps the order that the column split gives to Columns and values, and puts the others last", () => {
    const query = createQuery(
      [CATEGORY, VENDOR, CREATED_AT_YEAR, CREATED_AT_MONTH],
      [COUNT, SUM_OF_TOTAL],
    );

    expect(
      getPivotLayout(query, STAGE_INDEX, {
        rows: ["CREATED_AT"],
        columns: ["CREATED_AT_2", "VENDOR"],
        values: ["sum"],
      }),
    ).toEqual({
      rows: ["CREATED_AT"],
      columns: ["CREATED_AT_2", "VENDOR", "CATEGORY"],
      values: ["sum", "count"],
    });
  });

  it("keeps the order of the query when no grouping is in Rows", () => {
    const query = createQuery([CATEGORY, VENDOR], [COUNT, SUM_OF_TOTAL]);

    expect(
      getPivotLayout(query, STAGE_INDEX, {
        rows: ["UNKNOWN"],
        columns: ["VENDOR", "CATEGORY"],
        values: ["sum", "count"],
      }),
    ).toEqual({
      rows: [],
      columns: ["CATEGORY", "VENDOR"],
      values: ["count", "sum"],
    });
  });
});

describe("getWellItems", () => {
  it("lists the items of each well in the order of the layout", () => {
    const query = createQuery(
      [CATEGORY, VENDOR, CREATED_AT_MONTH],
      [COUNT, SUM_OF_TOTAL],
    );

    const { valueItems, columnItems, rowItems } = getWellItems(
      query,
      STAGE_INDEX,
      {
        rows: ["CREATED_AT", "CATEGORY"],
        columns: ["VENDOR"],
        values: ["sum", "count"],
      },
    );

    expect(valueItems.map(({ key }) => key)).toEqual(["sum", "count"]);
    expect(columnItems.map(({ key }) => key)).toEqual(["VENDOR"]);
    expect(rowItems.map(({ key }) => key)).toEqual(["CREATED_AT", "CATEGORY"]);
  });
});

describe("getPivotSplit", () => {
  it("is the layout when it has a value and a grouping in Rows, and nothing otherwise", () => {
    const layout = {
      rows: ["CREATED_AT"],
      columns: ["CATEGORY"],
      values: ["count"],
    };

    expect(getPivotSplit(layout)).toEqual(layout);
    expect(getPivotSplit({ ...layout, rows: [] })).toBeNull();
    expect(getPivotSplit({ ...layout, values: [] })).toBeNull();
  });
});

describe("getPivotLayoutAfterDrop", () => {
  const query = createQuery([CATEGORY, VENDOR, CREATED_AT_MONTH]);
  const [category, vendor, createdAt] = getDimensionItems(query, STAGE_INDEX);
  const LAYOUT = {
    rows: ["CREATED_AT", "VENDOR"],
    columns: ["CATEGORY"],
    values: ["count"],
  };
  const chipDrag = (
    item: typeof category,
    wellId: SummaryDimensionWellId,
  ): SummaryDragItem => ({ kind: "dimension", item, wellId });

  it("moves a chip that is dropped on the other grouping well to the end of that well", () => {
    expect(
      getPivotLayoutAfterDrop(
        query,
        STAGE_INDEX,
        chipDrag(category, "columns"),
        "rows",
        LAYOUT,
      ),
    ).toEqual({
      rows: ["CREATED_AT", "VENDOR", "CATEGORY"],
      columns: [],
      values: ["count"],
    });
    expect(
      getPivotLayoutAfterDrop(
        query,
        STAGE_INDEX,
        chipDrag(createdAt, "rows"),
        "columns",
        LAYOUT,
      ),
    ).toEqual({
      rows: ["VENDOR"],
      columns: ["CATEGORY", "CREATED_AT"],
      values: ["count"],
    });
  });

  it("returns the same layout for a drop that is not a move between Columns and Rows", () => {
    const rowsChip = chipDrag(vendor, "rows");
    const [rating] = getFieldSections(query, STAGE_INDEX)
      .flatMap((section) => section.items)
      .filter((item) => item.name === "Rating");
    const fieldDrag: SummaryDragItem = {
      kind: "field",
      field: rating.field,
      label: rating.name,
    };

    expect(
      getPivotLayoutAfterDrop(query, STAGE_INDEX, rowsChip, "rows", LAYOUT),
    ).toBe(LAYOUT);
    expect(
      getPivotLayoutAfterDrop(query, STAGE_INDEX, rowsChip, "values", LAYOUT),
    ).toBe(LAYOUT);
    expect(
      getPivotLayoutAfterDrop(query, STAGE_INDEX, fieldDrag, "rows", LAYOUT),
    ).toBe(LAYOUT);
  });
});
