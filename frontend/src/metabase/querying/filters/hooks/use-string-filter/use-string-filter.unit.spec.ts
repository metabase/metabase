import { act, renderHook } from "@testing-library/react-hooks";

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import {
  createOrdersIdField,
  createOrdersProductIdField,
  createOrdersTable,
  createProductsCategoryField,
  createProductsEanField,
  createProductsIdField,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { useStringFilter } from "./use-string-filter";

interface CreateFilterCase {
  operator: Lib.StringFilterOperatorName;
  values: string[];
  expectedDisplayName: string;
}

interface UpdateFilterCase {
  operator: Lib.StringFilterOperatorName;
  expression: Lib.ExpressionClause;
  values: string[];
  expectedDisplayName: string;
}

interface ValidateFilterCase {
  operator: Lib.StringFilterOperatorName;
  values: string[];
}

interface DefaultOperatorCase {
  title: string;
  column: Lib.ColumnMetadata;
  expectedOperator: Lib.StringFilterOperatorName;
}

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [
            createOrdersIdField({
              base_type: "type/Text",
              effective_type: "type/Text",
            }),
            createOrdersProductIdField({
              base_type: "type/Text",
              effective_type: "type/Text",
            }),
          ],
        }),
        createProductsTable({
          fields: [
            createProductsIdField({
              base_type: "type/Text",
              effective_type: "type/Text",
            }),
            createProductsCategoryField(),
            createProductsEanField(),
          ],
        }),
      ],
    }),
  ],
});

describe("useStringFilter", () => {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const findColumn = columnFinder(defaultQuery, availableColumns);
  const column = findColumn("PRODUCTS", "CATEGORY");

  it.each<CreateFilterCase>([
    {
      operator: "=",
      values: ["Gadget", "Widget"],
      expectedDisplayName: "Category is 2 selections",
    },
    {
      operator: "!=",
      values: ["Gadget"],
      expectedDisplayName: "Category is not Gadget",
    },
    {
      operator: "contains",
      values: ["get"],
      expectedDisplayName: "Category contains get",
    },
    {
      operator: "is-empty",
      values: [],
      expectedDisplayName: "Category is empty",
    },
    {
      operator: "not-empty",
      values: [],
      expectedDisplayName: "Category is not empty",
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator: newOperator, values: newValues, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useStringFilter({
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

      const { operator, values, options, getFilterClause } = result.current;
      const newFilter = checkNotNull(
        getFilterClause(operator, values, options),
      );
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
      expression: Lib.stringFilterClause({
        operator: "=",
        column,
        values: ["Gadget", "Gizmo"],
        options: {},
      }),
      values: ["Widget"],
      expectedDisplayName: "Category is Widget",
    },
    {
      operator: "starts-with",
      expression: Lib.stringFilterClause({
        operator: "starts-with",
        column,
        values: ["Ga"],
        options: {},
      }),
      values: ["Wi"],
      expectedDisplayName: "Category starts with Wi",
    },
  ])(
    'should allow to update a filter for "$operator" operator',
    ({ expression, values: newValues, expectedDisplayName }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useStringFilter({
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

      const { operator, values, options, getFilterClause } = result.current;
      const newFilter = checkNotNull(
        getFilterClause(operator, values, options),
      );
      expect(Lib.displayInfo(query, stageIndex, newFilter)).toMatchObject({
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
      operator: "!=",
      values: [],
    },
    {
      operator: "starts-with",
      values: [],
    },
    {
      operator: "ends-with",
      values: [],
    },
  ])(
    'should validate values for "$operator" operator',
    ({ operator: newOperator, values: newValues }) => {
      const { result } = renderHook(() =>
        useStringFilter({
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

      const { operator, values, options, isValid, getFilterClause } =
        result.current;
      expect(isValid).toBeFalsy();
      expect(getFilterClause(operator, values, options)).toBeUndefined();
    },
  );

  it("should preserve values when switching operators", () => {
    const { result } = renderHook(() =>
      useStringFilter({
        query: defaultQuery,
        stageIndex,
        column,
      }),
    );

    act(() => {
      const { setValues } = result.current;
      setValues(["Gadget"]);
    });

    act(() => {
      const { values, getDefaultValues, setOperator, setValues } =
        result.current;
      const newOperator = "!=";
      setOperator(newOperator);
      setValues(getDefaultValues(newOperator, values));
    });

    const { operator, values, options, getFilterClause } = result.current;
    const newFilter = checkNotNull(getFilterClause(operator, values, options));
    expect(Lib.displayInfo(defaultQuery, stageIndex, newFilter)).toMatchObject({
      displayName: "Category is not Gadget",
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
      column: findColumn("PRODUCTS", "CATEGORY"),
      expectedOperator: "=",
    },
    {
      title: "regular column",
      column: findColumn("PRODUCTS", "EAN"),
      expectedOperator: "contains",
    },
  ])(
    'should use "$expectedOperator" operator for $title',
    ({ column, expectedOperator }) => {
      const { result } = renderHook(() =>
        useStringFilter({
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
