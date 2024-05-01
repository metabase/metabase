import { renderHook, act } from "@testing-library/react-hooks";

import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

import { useTimeFilter } from "./use-time-filter";

interface CreateFilterCase {
  operator: Lib.TimeFilterOperatorName;
  values: Date[];
  expectedDisplayName: string;
}

interface UpdateFilterCase {
  expression: Lib.ExpressionClause;
  values: Date[];
  expectedDisplayName: string;
}

interface CoerceFilterCase {
  operator: Lib.TimeFilterOperatorName;
  values: Date[];
  expectedDisplayName: string;
}

interface ValidateFilterCase {
  operator: Lib.TimeFilterOperatorName;
  values: (Date | null)[];
}

const TIME_1 = new Date(2020, 0, 1, 10, 20);
const TIME_2 = new Date(2020, 0, 1, 12, 45);
const TIME_3 = new Date(2020, 0, 1, 20, 15);

const TIME_FIELD = createMockField({
  id: 102,
  table_id: ORDERS_ID,
  name: "TIME",
  display_name: "Time",
  base_type: "type/Time",
  effective_type: "type/Time",
  semantic_type: null,
});

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [createOrdersIdField(), TIME_FIELD],
        }),
      ],
    }),
  ],
});

describe("useTimeFilter", () => {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const column = columnFinder(defaultQuery, availableColumns)(
    "ORDERS",
    TIME_FIELD.name,
  );

  it.each<CreateFilterCase>([
    {
      operator: "<",
      values: [TIME_1],
      expectedDisplayName: "Time is before 10:20 AM",
    },
    {
      operator: ">",
      values: [TIME_1],
      expectedDisplayName: "Time is after 10:20 AM",
    },
    {
      operator: "between",
      values: [TIME_1, TIME_3],
      expectedDisplayName: "Time is 10:20 AM – 8:15 PM",
    },
    {
      operator: "is-null",
      values: [],
      expectedDisplayName: "Time is empty",
    },
    {
      operator: "not-null",
      values: [],
      expectedDisplayName: "Time is not empty",
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator: newOperator, values: newValues, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useTimeFilter({
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
      expression: Lib.timeFilterClause({
        operator: "<",
        column,
        values: [TIME_1],
      }),
      values: [TIME_2],
      expectedDisplayName: "Time is before 12:45 PM",
    },
    {
      expression: Lib.timeFilterClause({
        operator: ">",
        column,
        values: [TIME_1],
      }),
      values: [TIME_2],
      expectedDisplayName: "Time is after 12:45 PM",
    },
    {
      expression: Lib.timeFilterClause({
        operator: "between",
        column,
        values: [TIME_1, TIME_2],
      }),
      values: [TIME_2, TIME_3],
      expectedDisplayName: "Time is 12:45 PM – 8:15 PM",
    },
  ])(
    'should allow to update a filter for "$operator" operator',
    ({ expression, values: newValues, expectedDisplayName }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useTimeFilter({
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
      values: [TIME_3, TIME_1],
      expectedDisplayName: "Time is 10:20 AM – 8:15 PM",
    },
  ])(
    "should allow to coerce a filter: $expectedDisplayName",
    ({ operator, values, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useTimeFilter({
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
      operator: "<",
      values: [null],
    },
    {
      operator: ">",
      values: [null],
    },
    {
      operator: "between",
      values: [null, null],
    },
  ])(
    'should validate values for "$operator" operator',
    ({ operator: newOperator, values: newValues }) => {
      const { result } = renderHook(() =>
        useTimeFilter({
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
      useTimeFilter({
        query: defaultQuery,
        stageIndex,
        column,
      }),
    );

    act(() => {
      const { setValues } = result.current;
      setValues([TIME_1]);
    });

    act(() => {
      const { values, getDefaultValues, setOperator, setValues } =
        result.current;
      const newOperator = ">";
      setOperator(newOperator);
      setValues(getDefaultValues(newOperator, values));
    });

    const { operator, values, getFilterClause } = result.current;
    const newFilter = checkNotNull(getFilterClause(operator, values));
    expect(Lib.displayInfo(defaultQuery, stageIndex, newFilter)).toMatchObject({
      displayName: "Time is after 10:20 AM",
    });
  });
});
