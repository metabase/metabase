import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  ColumnNameColumnSplitSetting,
  TestAggregationSpec,
  TestBreakoutSpec,
} from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import {
  NO_PIVOT_LAYOUT,
  getNextPivotLayout,
  getPivotLayout,
  getPivotLayoutAfterDrop,
  getPivotSplit,
  getWellItems,
} from "./pivot-layout";
import type { SummaryDimensionWellId, SummaryDragItem } from "./types";
import {
  addField,
  changeDimensionBucket,
  changeValueOperator,
  clearWell,
  getDimensionItems,
  getFieldSections,
  getValueItems,
} from "./utils";

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

function getKeys(query: Lib.Query) {
  return getDimensionItems(query, STAGE_INDEX).map(({ key }) => key);
}

function addColumn(
  query: Lib.Query,
  wellId: "values" | "columns" | "rows",
  name: string,
) {
  const item = getFieldSections(query, STAGE_INDEX)
    .flatMap((section) => section.items)
    .find((item) => item.name === name);
  expect(item).toBeDefined();
  return item ? addField(query, STAGE_INDEX, wellId, item.field) : query;
}

function removeGrouping(query: Lib.Query, index: number) {
  const [clause] = Lib.breakouts(query, STAGE_INDEX).slice(index);
  return Lib.removeClause(query, STAGE_INDEX, clause);
}

function withRows(rows: string[]): ColumnNameColumnSplitSetting {
  return { ...NO_PIVOT_LAYOUT, rows };
}

describe("getPivotLayout", () => {
  it("puts the groupings that are not in Rows in Columns, with every value", () => {
    const query = createQuery([CATEGORY, CREATED_AT_MONTH]);

    expect(
      getPivotLayout(query, STAGE_INDEX, withRows(["CREATED_AT"])),
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
  const layout = {
    rows: ["CREATED_AT"],
    columns: ["CATEGORY"],
    values: ["count"],
  };

  it("is the layout when it has a value and a grouping in Rows", () => {
    expect(getPivotSplit(layout)).toEqual(layout);
  });

  it("needs a grouping in Rows", () => {
    expect(getPivotSplit({ ...layout, rows: [] })).toBeNull();
  });

  it("needs a value", () => {
    expect(getPivotSplit({ ...layout, values: [] })).toBeNull();
  });
});

describe("getNextPivotLayout", () => {
  it("puts a grouping that is added to Rows in Rows", () => {
    const query = createQuery([CATEGORY]);
    const nextQuery = addColumn(query, "rows", "Created At");

    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: getPivotLayout(query, STAGE_INDEX, NO_PIVOT_LAYOUT),
        addedWellId: "rows",
      }),
    ).toEqual({
      rows: ["CREATED_AT"],
      columns: ["CATEGORY"],
      values: ["count"],
    });
  });

  it("keeps the order of the Rows groupings and puts an added one last", () => {
    const query = createQuery([CATEGORY, CREATED_AT_MONTH]);
    const nextQuery = addColumn(query, "rows", "Vendor");

    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: getPivotLayout(
          query,
          STAGE_INDEX,
          withRows(["CREATED_AT", "CATEGORY"]),
        ),
        addedWellId: "rows",
      }).rows,
    ).toEqual(["CREATED_AT", "CATEGORY", "VENDOR"]);
  });

  it("keeps the order of the Columns groupings and of the values, and puts added ones last", () => {
    const query = createQuery(
      [CATEGORY, VENDOR, CREATED_AT_MONTH],
      [COUNT, SUM_OF_TOTAL],
    );
    const layout = {
      rows: ["CREATED_AT"],
      columns: ["VENDOR", "CATEGORY"],
      values: ["sum", "count"],
    };
    const withValue = addColumn(query, "values", "Quantity");
    const withGrouping = addColumn(query, "columns", "Rating");

    expect(
      getNextPivotLayout({
        query,
        nextQuery: withValue,
        stageIndex: STAGE_INDEX,
        layout,
        addedWellId: "values",
      }),
    ).toEqual({ ...layout, values: ["sum", "count", "sum_2"] });
    expect(
      getNextPivotLayout({
        query,
        nextQuery: withGrouping,
        stageIndex: STAGE_INDEX,
        layout,
        addedWellId: "columns",
      }),
    ).toEqual({ ...layout, columns: ["VENDOR", "CATEGORY", "RATING"] });
  });

  it("follows the groupings whose key changes when an earlier grouping of their column goes away", () => {
    const query = createQuery([
      CREATED_AT_YEAR,
      CREATED_AT_MONTH,
      CATEGORY,
      VENDOR,
    ]);
    const nextQuery = removeGrouping(query, 0);
    expect(getKeys(query)).toEqual([
      "CREATED_AT",
      "CREATED_AT_2",
      "CATEGORY",
      "VENDOR",
    ]);
    expect(getKeys(nextQuery)).toEqual(["CREATED_AT", "CATEGORY", "VENDOR"]);

    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: {
          rows: ["CREATED_AT_2"],
          columns: ["VENDOR", "CREATED_AT", "CATEGORY"],
          values: ["count"],
        },
      }),
    ).toEqual({
      rows: ["CREATED_AT"],
      columns: ["VENDOR", "CATEGORY"],
      values: ["count"],
    });
    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: {
          rows: ["CATEGORY"],
          columns: ["CREATED_AT_2", "VENDOR", "CREATED_AT"],
          values: ["count"],
        },
      }),
    ).toEqual({
      rows: ["CATEGORY"],
      columns: ["CREATED_AT", "VENDOR"],
      values: ["count"],
    });
  });

  it("doesn't hand a removed Rows grouping's key over to the grouping that takes it", () => {
    const query = createQuery([CREATED_AT_YEAR, CREATED_AT_MONTH]);
    const nextQuery = removeGrouping(query, 0);

    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: getPivotLayout(query, STAGE_INDEX, withRows(["CREATED_AT"])),
      }).rows,
    ).toEqual([]);
  });

  it("keeps a Rows grouping in Rows when its unit changes", () => {
    const query = createQuery([CATEGORY, CREATED_AT_MONTH]);
    const [, createdAt] = getDimensionItems(query, STAGE_INDEX);
    const yearOption = createdAt.bucketOptions.find(
      (option) => option.displayName === "Year",
    );
    expect(yearOption).toBeDefined();
    const nextQuery = yearOption
      ? changeDimensionBucket(query, STAGE_INDEX, createdAt, yearOption)
      : query;
    expect(nextQuery).not.toBe(query);

    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: getPivotLayout(query, STAGE_INDEX, withRows(["CREATED_AT"])),
      }).rows,
    ).toEqual(["CREATED_AT"]);
  });

  it("keeps the place of a value when its operator changes", () => {
    const query = createQuery([CATEGORY], [COUNT, SUM_OF_TOTAL]);
    const sumOfTotal = getValueItems(query, STAGE_INDEX)
      .filter((item) => item.kind === "column")
      .find((item) => item.key === "sum");
    const average = sumOfTotal?.operatorOptions.find(
      (option) => option.shortName === "avg",
    );
    expect(average).toBeDefined();
    const nextQuery =
      sumOfTotal && average
        ? changeValueOperator(query, STAGE_INDEX, sumOfTotal, average.operator)
        : query;
    expect(nextQuery).not.toBe(query);

    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: {
          rows: ["CATEGORY"],
          columns: [],
          values: ["sum", "count"],
        },
      }).values,
    ).toEqual(["avg", "count"]);
  });

  it("empties Rows when the groupings are cleared", () => {
    const query = createQuery([CATEGORY, CREATED_AT_MONTH]);
    const nextQuery = clearWell(query, STAGE_INDEX, "columns");

    expect(
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: getPivotLayout(query, STAGE_INDEX, withRows(["CREATED_AT"])),
      }),
    ).toEqual({ rows: [], columns: [], values: ["count"] });
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

  it("moves a Columns chip that is dropped on Rows to the end of Rows", () => {
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
  });

  it("moves a Rows chip that is dropped on Columns to the end of Columns", () => {
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
