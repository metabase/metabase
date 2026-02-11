import { act, renderHook } from "@testing-library/react";

import { createMockMetadata } from "__support__/metadata";
import type { BooleanFilterValue } from "metabase/querying/common/types";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { useBooleanFilter } from "./use-boolean-filter";

interface CreateFilterCase {
  value: BooleanFilterValue;
  expectedDisplayName: string;
}

interface UpdateFilterCase {
  expression: Lib.ExpressionClause;
  value: BooleanFilterValue;
  expectedDisplayName: string;
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
    { value: "true", expectedDisplayName: "Is trial is true" },
    { value: "false", expectedDisplayName: "Is trial is false" },
    { value: "is-null", expectedDisplayName: "Is trial is empty" },
    { value: "not-null", expectedDisplayName: "Is trial is not empty" },
  ])(
    'should allow to create a filter for "$optionType"',
    ({ value, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useBooleanFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { setValue } = result.current;
        setValue(value);
      });

      const { getFilterClause } = result.current;
      const newFilter = getFilterClause();
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
      value: "false",
      expectedDisplayName: "Is trial is false",
    },
    {
      expression: Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [true],
      }),
      value: "is-null",
      expectedDisplayName: "Is trial is empty",
    },
  ])(
    'should allow to update a filter for "$optionType"',
    ({ expression, value, expectedDisplayName }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useBooleanFilter({
          query: defaultQuery,
          stageIndex,
          column,
          filter,
        }),
      );

      act(() => {
        const { setValue } = result.current;
        setValue(value);
      });

      const { getFilterClause } = result.current;
      const newFilter = getFilterClause();
      expect(
        Lib.displayInfo(defaultQuery, stageIndex, newFilter),
      ).toMatchObject({
        displayName: expectedDisplayName,
      });
    },
  );
});
