import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import {
  columnFinder,
  createQuery,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import type {
  ParameterTarget,
  ParameterType,
  ParameterValueOrArray,
} from "metabase-types/api";
import { createMockField } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersTable,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { applyParameter } from "./query";

type FilterParameterCase = {
  type: ParameterType;
  target: ParameterTarget;
  value: ParameterValueOrArray;
  expectedDisplayName: string;
};

type TemporalUnitParameterCase = {
  value: ParameterValueOrArray;
  expectedDisplayName: string;
};

const BOOLEAN_FIELD = createMockField({
  id: 102,
  table_id: ORDERS_ID,
  name: "IS_TRIAL",
  display_name: "Is trial",
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
  semantic_type: "type/Category",
});

const ORDERS_TABLE = createOrdersTable();

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [...(ORDERS_TABLE.fields ?? []), BOOLEAN_FIELD],
        }),
        createProductsTable(),
      ],
    }),
  ],
});

describe("applyParameter", () => {
  describe("filter parameters", () => {
    const query = createQuery({ metadata: METADATA });
    const stageIndex = 0;
    const columns = Lib.filterableColumns(query, stageIndex);
    const findColumn = columnFinder(query, columns);

    function getFilterColumnTarget(
      tableName: string,
      columnName: string,
    ): ParameterTarget {
      const column = findColumn(tableName, columnName);
      const columnRef = Lib.legacyRef(query, stageIndex, column);
      return ["dimension", columnRef] as ParameterTarget;
    }

    it.each<FilterParameterCase>([
      {
        type: "id",
        target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
        value: "Gadget",
        expectedDisplayName: "Category is Gadget",
      },
      {
        type: "category",
        target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
        value: "Gadget",
        expectedDisplayName: "Category is Gadget",
      },
      {
        type: "string/=",
        target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
        value: "Widget",
        expectedDisplayName: "Category is Widget",
      },
      {
        type: "string/=",
        target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
        value: ["Widget", "Gadget"],
        expectedDisplayName: "Category is 2 selections",
      },
      {
        type: "string/!=",
        target: getFilterColumnTarget("PRODUCTS", "CATEGORY"),
        value: ["Widget"],
        expectedDisplayName: "Category is not Widget",
      },
      {
        type: "string/contains",
        target: getFilterColumnTarget("PRODUCTS", "EAN"),
        value: ["123"],
        expectedDisplayName: "Ean contains 123",
      },
      {
        type: "string/does-not-contain",
        target: getFilterColumnTarget("PRODUCTS", "EAN"),
        value: ["123"],
        expectedDisplayName: "Ean does not contain 123",
      },
      {
        type: "string/starts-with",
        target: getFilterColumnTarget("PRODUCTS", "VENDOR"),
        value: "abc",
        expectedDisplayName: "Vendor starts with abc",
      },
      {
        type: "string/ends-with",
        target: getFilterColumnTarget("PRODUCTS", "VENDOR"),
        value: "abc",
        expectedDisplayName: "Vendor ends with abc",
      },
      {
        type: "id",
        target: getFilterColumnTarget("ORDERS", "ID"),
        value: 10,
        expectedDisplayName: "ID is 10",
      },
      {
        type: "id",
        target: getFilterColumnTarget("ORDERS", "ID"),
        value: ["10"],
        expectedDisplayName: "ID is 10",
      },
      {
        type: "id",
        target: getFilterColumnTarget("ORDERS", "ID"),
        value: ["10", "abc", "20"],
        expectedDisplayName: "ID is 2 selections",
      },
      {
        type: "category",
        target: getFilterColumnTarget("ORDERS", "QUANTITY"),
        value: 5,
        expectedDisplayName: "Quantity is equal to 5",
      },
      {
        type: "number/=",
        target: getFilterColumnTarget("ORDERS", "TOTAL"),
        value: 10.2,
        expectedDisplayName: "Total is equal to 10.2",
      },
      {
        type: "string/=", // category filter
        target: getFilterColumnTarget("ORDERS", "QUANTITY"),
        value: 10,
        expectedDisplayName: "Quantity is equal to 10",
      },
      {
        type: "number/!=",
        target: getFilterColumnTarget("ORDERS", "TOTAL"),
        value: 10.2,
        expectedDisplayName: "Total is not equal to 10.2",
      },
      {
        type: "string/!=", // category filter
        target: getFilterColumnTarget("ORDERS", "QUANTITY"),
        value: 10,
        expectedDisplayName: "Quantity is not equal to 10",
      },
      {
        type: "number/>=",
        target: getFilterColumnTarget("ORDERS", "TOTAL"),
        value: 10.2,
        expectedDisplayName: "Total is greater than or equal to 10.2",
      },
      {
        type: "number/<=",
        target: getFilterColumnTarget("ORDERS", "TOTAL"),
        value: 10.2,
        expectedDisplayName: "Total is less than or equal to 10.2",
      },
      {
        type: "number/between",
        target: getFilterColumnTarget("ORDERS", "TOTAL"),
        value: [10.2, 20.4],
        expectedDisplayName: "Total is between 10.2 and 20.4",
      },
      {
        type: "id",
        target: getFilterColumnTarget("ORDERS", "IS_TRIAL"),
        value: [true],
        expectedDisplayName: "Is trial is true",
      },
      {
        type: "category",
        target: getFilterColumnTarget("ORDERS", "IS_TRIAL"),
        value: [true],
        expectedDisplayName: "Is trial is true",
      },
      {
        type: "string/=",
        target: getFilterColumnTarget("ORDERS", "IS_TRIAL"),
        value: [false],
        expectedDisplayName: "Is trial is false",
      },
      {
        type: "string/=",
        target: getFilterColumnTarget("ORDERS", "IS_TRIAL"),
        value: [true, false],
        expectedDisplayName: "Is trial is 2 selections",
      },
      {
        type: "string/!=",
        target: getFilterColumnTarget("ORDERS", "IS_TRIAL"),
        value: [true],
        expectedDisplayName: "Is trial is not true",
      },
      {
        type: "string/!=",
        target: getFilterColumnTarget("ORDERS", "IS_TRIAL"),
        value: [false],
        expectedDisplayName: "Is trial is not false",
      },
      {
        type: "string/!=",
        target: getFilterColumnTarget("ORDERS", "IS_TRIAL"),
        value: [true, false],
        expectedDisplayName: "Is trial is not 2 selections",
      },
      {
        type: "date/single",
        target: getFilterColumnTarget("ORDERS", "CREATED_AT"),
        value: "2024-04-02",
        expectedDisplayName: "Created At is on Apr 2, 2024",
      },
      {
        type: "date/range",
        target: getFilterColumnTarget("ORDERS", "CREATED_AT"),
        value: "2024-04-02~2024-05-20",
        expectedDisplayName: "Created At is Apr 2 – May 20, 2024",
      },
      {
        type: "date/month-year",
        target: getFilterColumnTarget("ORDERS", "CREATED_AT"),
        value: "2020-12",
        expectedDisplayName: "Created At is Dec 1–31, 2020",
      },
      {
        type: "date/quarter-year",
        target: getFilterColumnTarget("ORDERS", "CREATED_AT"),
        value: "Q3-2020",
        expectedDisplayName: "Created At is Jul 1 – Sep 30, 2020",
      },
      {
        type: "date/relative",
        target: getFilterColumnTarget("ORDERS", "CREATED_AT"),
        value: "past1days",
        expectedDisplayName: "Created At is yesterday",
      },
      {
        type: "date/all-options",
        target: getFilterColumnTarget("ORDERS", "CREATED_AT"),
        value: "~2020-05-20",
        expectedDisplayName: "Created At is before May 20, 2020",
      },
    ])(
      "should apply a filter parameter",
      ({ type, target, value, expectedDisplayName }) => {
        const newQuery = applyParameter(query, stageIndex, type, target, value);
        const [newFilter] = Lib.filters(newQuery, stageIndex);
        expect(Lib.displayInfo(newQuery, stageIndex, newFilter)).toMatchObject({
          displayName: expectedDisplayName,
        });
      },
    );
  });

  describe("temporal unit parameters", () => {
    const query = createQueryWithClauses({
      breakouts: [
        {
          tableName: "ORDERS",
          columnName: "CREATED_AT",
          temporalBucketName: "Month",
        },
      ],
    });
    const stageIndex = 0;
    const columns = Lib.breakouts(query, stageIndex).map(breakout =>
      Lib.breakoutColumn(query, stageIndex, breakout),
    );
    const findColumn = columnFinder(query, columns);
    const column = findColumn("ORDERS", "CREATED_AT");
    const columnRef = Lib.legacyRef(query, stageIndex, column);
    const target = ["dimension", columnRef] as ParameterTarget;

    it.each<TemporalUnitParameterCase>([
      {
        value: "year",
        expectedDisplayName: "Created At: Year",
      },
      {
        value: "month-of-year",
        expectedDisplayName: "Created At: Month of year",
      },
      {
        value: "abc",
        expectedDisplayName: "Created At: Month",
      },
    ])(
      "should apply a temporal unit parameter",
      ({ value, expectedDisplayName }) => {
        const newQuery = applyParameter(
          query,
          stageIndex,
          "temporal-unit",
          target,
          value,
        );
        const [newBreakout] = Lib.breakouts(newQuery, stageIndex);
        expect(
          Lib.displayInfo(newQuery, stageIndex, newBreakout),
        ).toMatchObject({
          displayName: expectedDisplayName,
        });
      },
    );
  });
});
