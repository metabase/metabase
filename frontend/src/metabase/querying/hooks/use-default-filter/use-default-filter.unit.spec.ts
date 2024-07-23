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

import { useDefaultFilter } from "./use-default-filter";

interface CreateFilterCase {
  operator: Lib.DefaultFilterOperatorName;
  expectedDisplayName: string;
}

interface UpdateFilterCase {
  expression: Lib.ExpressionClause;
  operator: Lib.DefaultFilterOperatorName;
  expectedDisplayName: string;
}

const UNKNOWN_FIELD = createMockField({
  id: 102,
  table_id: ORDERS_ID,
  name: "UNKNOWN",
  display_name: "Unknown",
  base_type: "type/*",
  effective_type: "type/*",
  semantic_type: null,
});

const METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [createOrdersIdField(), UNKNOWN_FIELD],
        }),
      ],
    }),
  ],
});

describe("useDefaultFilter", () => {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const column = columnFinder(defaultQuery, availableColumns)(
    "ORDERS",
    UNKNOWN_FIELD.name,
  );

  it.each<CreateFilterCase>([
    {
      operator: "is-null",
      expectedDisplayName: `${UNKNOWN_FIELD.display_name} is empty`,
    },
    {
      operator: "not-null",
      expectedDisplayName: `${UNKNOWN_FIELD.display_name} is not empty`,
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator: newOperator, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useDefaultFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { setOperator } = result.current;
        setOperator(newOperator);
      });

      const { operator, getFilterClause } = result.current;
      const newFilter = checkNotNull(getFilterClause(operator));
      expect(
        Lib.displayInfo(defaultQuery, stageIndex, newFilter),
      ).toMatchObject({
        displayName: expectedDisplayName,
      });
    },
  );

  it.each<UpdateFilterCase>([
    {
      expression: Lib.defaultFilterClause({
        operator: "is-null",
        column,
      }),
      operator: "not-null",
      expectedDisplayName: `${UNKNOWN_FIELD.display_name} is not empty`,
    },
  ])(
    'should allow to update a filter for "$operator" operator',
    ({ expression, operator: newOperator, expectedDisplayName }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useDefaultFilter({
          query,
          stageIndex,
          column,
          filter,
        }),
      );

      act(() => {
        const { setOperator } = result.current;
        setOperator(newOperator);
      });

      const { operator, getFilterClause } = result.current;
      const newFilter = checkNotNull(getFilterClause(operator));
      expect(Lib.displayInfo(query, stageIndex, newFilter)).toMatchObject({
        displayName: expectedDisplayName,
      });
    },
  );

  it("should be invalid if the initial operator is not set", () => {
    const { result } = renderHook(() =>
      useDefaultFilter({
        query: defaultQuery,
        stageIndex,
        column,
      }),
    );

    const { operator, getFilterClause } = result.current;
    expect(getFilterClause(operator)).toBeUndefined();
  });

  it("should be valid if the initial operator is set", () => {
    const { result } = renderHook(() =>
      useDefaultFilter({
        query: defaultQuery,
        stageIndex,
        column,
        hasInitialOperator: true,
      }),
    );

    const { operator, getFilterClause } = result.current;
    const newFilter = checkNotNull(getFilterClause(operator));
    expect(Lib.displayInfo(defaultQuery, stageIndex, newFilter)).toMatchObject({
      displayName: `${UNKNOWN_FIELD.display_name} is empty`,
    });
  });
});
