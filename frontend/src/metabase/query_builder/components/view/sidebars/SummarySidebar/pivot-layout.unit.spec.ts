import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TestBreakoutSpec } from "metabase-types/api";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getNextRowKeys } from "./pivot-layout";
import {
  addField,
  changeDimensionBucket,
  clearWell,
  getDimensionItems,
  getFieldSections,
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

function createQuery(breakouts: TestBreakoutSpec[]) {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count" }],
        breakouts,
      },
    ],
  });
}

function getKeys(query: Lib.Query) {
  return getDimensionItems(query, STAGE_INDEX).map(({ key }) => key);
}

function addColumn(query: Lib.Query, wellId: "columns" | "rows", name: string) {
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

describe("getNextRowKeys", () => {
  it("puts a grouping that is added to Rows in Rows", () => {
    const query = createQuery([CATEGORY]);
    const nextQuery = addColumn(query, "rows", "Created At");

    expect(
      getNextRowKeys({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        rowKeys: [],
        addedWellId: "rows",
      }),
    ).toEqual(["CREATED_AT"]);
  });

  it("keeps a grouping that is added to Columns out of Rows", () => {
    const query = createQuery([CATEGORY]);
    const nextQuery = addColumn(query, "columns", "Created At");

    expect(
      getNextRowKeys({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        rowKeys: ["CATEGORY"],
        addedWellId: "columns",
      }),
    ).toEqual(["CATEGORY"]);
  });

  it("follows a Rows grouping whose key changes when an earlier grouping of its column goes away", () => {
    const query = createQuery([CREATED_AT_YEAR, CREATED_AT_MONTH]);
    const nextQuery = removeGrouping(query, 0);
    expect(getKeys(query)).toEqual(["CREATED_AT", "CREATED_AT_2"]);
    expect(getKeys(nextQuery)).toEqual(["CREATED_AT"]);

    expect(
      getNextRowKeys({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        rowKeys: ["CREATED_AT_2"],
      }),
    ).toEqual(["CREATED_AT"]);
  });

  it("doesn't hand a removed Rows grouping's key over to the grouping that takes it", () => {
    const query = createQuery([CREATED_AT_YEAR, CREATED_AT_MONTH]);
    const nextQuery = removeGrouping(query, 0);

    expect(
      getNextRowKeys({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        rowKeys: ["CREATED_AT"],
      }),
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
      getNextRowKeys({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        rowKeys: ["CREATED_AT"],
      }),
    ).toEqual(["CREATED_AT"]);
  });

  it("empties Rows when the groupings are cleared", () => {
    const query = createQuery([CATEGORY, CREATED_AT_MONTH]);
    const nextQuery = clearWell(query, STAGE_INDEX, "columns");

    expect(
      getNextRowKeys({
        query,
        nextQuery,
        stageIndex: STAGE_INDEX,
        rowKeys: ["CREATED_AT"],
      }),
    ).toEqual([]);
  });
});
