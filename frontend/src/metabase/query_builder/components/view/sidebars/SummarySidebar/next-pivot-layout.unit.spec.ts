import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  ColumnNameColumnSplitSetting,
  TestAggregationSpec,
  TestBreakoutSpec,
} from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getNextPivotLayout } from "./next-pivot-layout";
import { NO_PIVOT_LAYOUT, getPivotLayout } from "./pivot-layout";
import {
  addField,
  changeDimensionBucket,
  changeValueOperator,
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

function getLayout(
  query: Lib.Query,
  rows: string[],
): ColumnNameColumnSplitSetting {
  return getPivotLayout(query, STAGE_INDEX, { ...NO_PIVOT_LAYOUT, rows });
}

describe("getNextPivotLayout", () => {
  it("puts a grouping that is added to Rows last in Rows", () => {
    const query = createQuery([CATEGORY, CREATED_AT_MONTH]);
    const nextQuery = addColumn(query, "rows", "Vendor");
    const getNextRows = (rows: string[]) =>
      getNextPivotLayout({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        layout: getLayout(query, rows),
        addedWellId: "rows",
      }).rows;

    expect(getNextRows([])).toEqual(["VENDOR"]);
    expect(getNextRows(["CREATED_AT", "CATEGORY"])).toEqual([
      "CREATED_AT",
      "CATEGORY",
      "VENDOR",
    ]);
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
        layout: getLayout(query, ["CREATED_AT"]),
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
        layout: getLayout(query, ["CREATED_AT"]),
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
});
