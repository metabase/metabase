import { act, renderHook } from "@testing-library/react-hooks";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { useNumberFilter } from "./use-number-filter";

interface CreateFilterCase {
  operator: Lib.NumberFilterOperatorName;
  values: number[];
  displayName: string;
}

interface UpdateFilterCase {
  operator: Lib.NumberFilterOperatorName;
  expression: Lib.ExpressionClause;
  values: number[];
  displayName: string;
}

interface CoerceFilterCase {
  operator: Lib.NumberFilterOperatorName;
  values: (number | "")[];
  displayName: string;
}

interface ValidateFilterCase {
  operator: Lib.NumberFilterOperatorName;
  values: (number | "")[];
}

describe("useNumberFilter", () => {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const column = columnFinder(
    defaultQuery,
    Lib.filterableColumns(defaultQuery, stageIndex),
  )("ORDERS", "TOTAL");

  it.each<CreateFilterCase>([
    {
      operator: "=",
      values: [10, 20],
      displayName: "Total is equal to 2 selections",
    },
    {
      operator: "!=",
      values: [10],
      displayName: "Total is not equal to 10",
    },
    {
      operator: ">",
      values: [10],
      displayName: "Total is greater than 10",
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator, values, displayName }) => {
      const { result } = renderHook(() =>
        useNumberFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { setOperator, setValues } = result.current;
        setOperator(operator);
        setValues(values);
      });

      act(() => {
        const { operator, values, getFilterClause } = result.current;
        const newFilter = checkNotNull(getFilterClause(operator, values));

        expect(
          Lib.displayInfo(defaultQuery, stageIndex, newFilter),
        ).toMatchObject({
          displayName,
        });
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
      displayName: "Total is equal to 20",
    },
  ])(
    'should allow to update a filter for "$operator" operator',
    ({ expression, values, displayName }) => {
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
        setValues(values);
      });

      act(() => {
        const { operator, values, getFilterClause } = result.current;
        const newFilter = checkNotNull(getFilterClause(operator, values));

        expect(Lib.displayInfo(query, stageIndex, newFilter)).toMatchObject({
          displayName,
        });
      });
    },
  );

  it.each<CoerceFilterCase>([
    {
      operator: "between",
      values: [20, 10],
      displayName: "Total is between 10 and 20",
    },
    {
      operator: "between",
      values: [10, ""],
      displayName: "Total is greater than or equal to 10",
    },
    {
      operator: "between",
      values: ["", 10],
      displayName: "Total is less than or equal to 10",
    },
  ])(
    'should allow to coerce a filter for "$operator" operator',
    ({ operator, values, displayName }) => {
      const { result } = renderHook(() =>
        useNumberFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { getFilterClause } = result.current;
        const newFilter = checkNotNull(getFilterClause(operator, values));

        expect(
          Lib.displayInfo(defaultQuery, stageIndex, newFilter),
        ).toMatchObject({
          displayName,
        });
      });
    },
  );

  it.each<ValidateFilterCase>([
    {
      operator: "=",
      values: [],
    },
    {
      operator: "between",
      values: ["", ""],
    },
  ])(
    'should validate values for "$operator" operator',
    ({ operator, values }) => {
      const { result } = renderHook(() =>
        useNumberFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { setOperator, setValues } = result.current;
        setOperator(operator);
        setValues(values);
      });

      act(() => {
        const { operator, values, isValid, getFilterClause } = result.current;
        expect(isValid).toBeFalsy();
        expect(getFilterClause(operator, values)).toBeUndefined();
      });
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

    act(() => {
      const { operator, values, getFilterClause } = result.current;
      const newFilter = checkNotNull(getFilterClause(operator, values));

      expect(
        Lib.displayInfo(defaultQuery, stageIndex, newFilter),
      ).toMatchObject({
        displayName: "Total is not equal to 10",
      });
    });
  });
});
