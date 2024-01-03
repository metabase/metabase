import { act, renderHook } from "@testing-library/react-hooks";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { useStringFilter } from "./use-string-filter";

interface CreateFilterCase {
  operator: Lib.StringFilterOperatorName;
  values: string[];
  displayName: string;
}

interface UpdateFilterCase {
  operator: Lib.StringFilterOperatorName;
  expression: Lib.ExpressionClause;
  values: string[];
  displayName: string;
}

interface ValidateFilterCase {
  operator: Lib.StringFilterOperatorName;
  values: string[];
}

describe("useStringFilter", () => {
  const defaultQuery = Lib.withDifferentTable(createQuery(), PRODUCTS_ID);
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const column = columnFinder(defaultQuery, availableColumns)(
    "PRODUCTS",
    "CATEGORY",
  );

  it.each<CreateFilterCase>([
    {
      operator: "=",
      values: ["Gadget", "Widget"],
      displayName: "Category is 2 selections",
    },
    {
      operator: "!=",
      values: ["Gadget"],
      displayName: "Category is not Gadget",
    },
    {
      operator: "contains",
      values: ["get"],
      displayName: "Category contains get",
    },
    {
      operator: "is-empty",
      values: [],
      displayName: "Category is empty",
    },
    {
      operator: "not-empty",
      values: [],
      displayName: "Category is not empty",
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator: newOperator, values: newValues, displayName }) => {
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
        displayName,
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
      displayName: "Category is Widget",
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
      displayName: "Category starts with Wi",
    },
  ])(
    'should allow to update a filter for "$operator" operator',
    ({ expression, values: newValues, displayName }) => {
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
        displayName,
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
      values: [""],
    },
    {
      operator: "ends-with",
      values: [""],
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
});
