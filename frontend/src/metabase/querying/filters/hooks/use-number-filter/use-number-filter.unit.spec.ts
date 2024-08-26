import { act, renderHook } from "@testing-library/react-hooks";

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import {
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersQuantityField,
  createOrdersTable,
  createOrdersTotalField,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { useNumberFilter } from "./use-number-filter";

interface CreateFilterCase {
  operator: Lib.NumberFilterOperatorName;
  values: number[];
  expectedDisplayName: string;
}

interface UpdateFilterCase {
  operator: Lib.NumberFilterOperatorName;
  expression: Lib.ExpressionClause;
  values: number[];
  expectedDisplayName: string;
}

interface CoerceFilterCase {
  operator: Lib.NumberFilterOperatorName;
  values: (number | "")[];
  expectedDisplayName: string;
}

interface ValidateFilterCase {
  operator: Lib.NumberFilterOperatorName;
  values: (number | "")[];
}

interface DefaultOperatorCase {
  title: string;
  column: Lib.ColumnMetadata;
  expectedOperator: Lib.NumberFilterOperatorName;
}

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [
            createOrdersIdField(),
            createOrdersProductIdField(),
            createOrdersTotalField(),
            createOrdersQuantityField({
              semantic_type: "type/Category",
            }),
          ],
        }),
        createProductsTable(),
      ],
    }),
  ],
});

describe("useNumberFilter", () => {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const findColumn = columnFinder(defaultQuery, availableColumns);
  const column = findColumn("ORDERS", "TOTAL");

  it.each<CreateFilterCase>([
    {
      operator: "=",
      values: [10, 20],
      expectedDisplayName: "Total is equal to 2 selections",
    },
    {
      operator: "!=",
      values: [10],
      expectedDisplayName: "Total is not equal to 10",
    },
    {
      operator: ">",
      values: [10],
      expectedDisplayName: "Total is greater than 10",
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator: newOperator, values: newValues, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useNumberFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { setOperator, setValues } = result.current;
        setOperator(newOperator);
        setValues(newValues);
      });

      const { operator, values, getFilterClause } = result.current;
      const newFilter = checkNotNull(getFilterClause(operator, values));
      expect(
        Lib.displayInfo(defaultQuery, stageIndex, newFilter),
      ).toMatchObject({
        displayName: expectedDisplayName,
      });
    },
  );

  it.each<UpdateFilterCase>([
    {
      operator: "=",
      expression: Lib.numberFilterClause({
        operator: "=",
        column,
        values: [10],
      }),
      values: [20],
      expectedDisplayName: "Total is equal to 20",
    },
  ])(
    'should allow to update a filter for "$operator" operator',
    ({ expression, values: newValues, expectedDisplayName }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useNumberFilter({
          query,
          stageIndex,
          column,
          filter,
        }),
      );

      act(() => {
        const { setValues } = result.current;
        setValues(newValues);
      });

      const { operator, values, getFilterClause } = result.current;
      const newFilter = checkNotNull(getFilterClause(operator, values));
      expect(Lib.displayInfo(query, stageIndex, newFilter)).toMatchObject({
        displayName: expectedDisplayName,
      });
    },
  );

  it.each<CoerceFilterCase>([
    {
      operator: "between",
      values: [20, 10],
      expectedDisplayName: "Total is between 10 and 20",
    },
    {
      operator: "between",
      values: [10, ""],
      expectedDisplayName: "Total is greater than or equal to 10",
    },
    {
      operator: "between",
      values: ["", 10],
      expectedDisplayName: "Total is less than or equal to 10",
    },
  ])(
    'should allow to coerce a filter for "$operator" operator',
    ({ operator, values, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useNumberFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      const { getFilterClause } = result.current;
      const newFilter = checkNotNull(getFilterClause(operator, values));
      expect(
        Lib.displayInfo(defaultQuery, stageIndex, newFilter),
      ).toMatchObject({
        displayName: expectedDisplayName,
      });
    },
  );

  it.each<ValidateFilterCase>([
    {
      operator: "=",
      values: [],
    },
    {
      operator: ">",
      values: [""],
    },
    {
      operator: "between",
      values: ["", ""],
    },
  ])(
    'should validate values for "$operator" operator',
    ({ operator: newOperator, values: newValues }) => {
      const { result } = renderHook(() =>
        useNumberFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { setOperator, setValues } = result.current;
        setOperator(newOperator);
        setValues(newValues);
      });

      const { operator, values, isValid, getFilterClause } = result.current;
      expect(isValid).toBeFalsy();
      expect(getFilterClause(operator, values)).toBeUndefined();
    },
  );

  it("should preserve values when switching operators", () => {
    const { result } = renderHook(() =>
      useNumberFilter({
        query: defaultQuery,
        stageIndex,
        column,
      }),
    );

    act(() => {
      const { setValues } = result.current;
      setValues([10]);
    });

    act(() => {
      const { values, getDefaultValues, setOperator, setValues } =
        result.current;
      const newOperator = "!=";
      setOperator(newOperator);
      setValues(getDefaultValues(newOperator, values));
    });

    const { operator, values, getFilterClause } = result.current;
    const newFilter = checkNotNull(getFilterClause(operator, values));
    expect(Lib.displayInfo(defaultQuery, stageIndex, newFilter)).toMatchObject({
      displayName: "Total is not equal to 10",
    });
  });

  it.each<DefaultOperatorCase>([
    {
      title: "PK column",
      column: findColumn("ORDERS", "ID"),
      expectedOperator: "=",
    },
    {
      title: "FK column",
      column: findColumn("ORDERS", "PRODUCT_ID"),
      expectedOperator: "=",
    },
    {
      title: "category column",
      column: findColumn("ORDERS", "QUANTITY"),
      expectedOperator: "=",
    },
    {
      title: "regular column",
      column: findColumn("ORDERS", "TOTAL"),
      expectedOperator: "between",
    },
  ])(
    'should use "$expectedOperator" operator for $title',
    ({ column, expectedOperator }) => {
      const { result } = renderHook(() =>
        useNumberFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      const { operator } = result.current;
      expect(operator).toBe(expectedOperator);
    },
  );
});
