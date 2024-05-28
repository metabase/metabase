import { act, renderHook } from "@testing-library/react-hooks";

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

import { useBooleanOperatorFilter } from "./use-boolean-operator-filter";

interface CreateFilterCase {
  operator: Lib.BooleanFilterOperatorName;
  values: boolean[];
  expectedDisplayName: string;
}

interface UpdateFilterCase {
  expression: Lib.ExpressionClause;
  operator: Lib.BooleanFilterOperatorName;
  expectedDisplayName: string;
}

interface ValidateFilterCase {
  operator: Lib.BooleanFilterOperatorName;
  values: boolean[];
}

const BOOLEAN_FIELD = createMockField({
  id: 102,
  table_id: ORDERS_ID,
  name: "IS_TRIAL",
  display_name: "Is trial",
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
  semantic_type: "type/Category",
});

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [createOrdersIdField(), BOOLEAN_FIELD],
        }),
      ],
    }),
  ],
});

describe("useBooleanOptionFilter", () => {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const column = columnFinder(defaultQuery, availableColumns)(
    "ORDERS",
    BOOLEAN_FIELD.name,
  );

  it.each<CreateFilterCase>([
    {
      operator: "=",
      values: [true],
      expectedDisplayName: "Is trial is true",
    },
    {
      operator: "=",
      values: [false],
      expectedDisplayName: "Is trial is false",
    },
    {
      operator: "is-null",
      values: [],
      expectedDisplayName: "Is trial is empty",
    },
    {
      operator: "not-null",
      values: [],
      expectedDisplayName: "Is trial is not empty",
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator: newOperator, values: newValues, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useBooleanOperatorFilter({
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
      expression: Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [true],
      }),
      operator: "is-null",
      expectedDisplayName: "Is trial is empty",
    },
  ])(
    'should allow to update a filter for "$operator" operator',
    ({ expression, operator: newOperator, expectedDisplayName }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useBooleanOperatorFilter({
          query,
          stageIndex,
          column,
          filter,
        }),
      );

      act(() => {
        const { getDefaultValues, setOperator, setValues } = result.current;
        setOperator(newOperator);
        setValues(getDefaultValues());
      });

      const { operator, values, getFilterClause } = result.current;
      const newFilter = checkNotNull(getFilterClause(operator, values));
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
  ])(
    'should validate values for "$operator" operator',
    ({ operator: newOperator, values: newValues }) => {
      const { result } = renderHook(() =>
        useBooleanOperatorFilter({
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
      expect(getFilterClause(operator, values)).toBeUndefined();
    },
  );
});
