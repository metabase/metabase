import { act, renderHook } from "@testing-library/react-hooks";

import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

import type { OptionType } from "./types";
import { useBooleanOptionFilter } from "./use-boolean-option-filter";

interface CreateFilterCase {
  optionType: OptionType;
  expectedDisplayName: string;
}

interface UpdateFilterCase {
  expression: Lib.ExpressionClause;
  optionType: OptionType;
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
    { optionType: "true", expectedDisplayName: "Is trial is true" },
    { optionType: "false", expectedDisplayName: "Is trial is false" },
    { optionType: "is-null", expectedDisplayName: "Is trial is empty" },
    { optionType: "not-null", expectedDisplayName: "Is trial is not empty" },
  ])(
    'should allow to create a filter for "$optionType"',
    ({ optionType, expectedDisplayName }) => {
      const { result } = renderHook(() =>
        useBooleanOptionFilter({
          query: defaultQuery,
          stageIndex,
          column,
        }),
      );

      act(() => {
        const { setOptionType } = result.current;
        setOptionType(optionType);
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
      optionType: "false",
      expectedDisplayName: "Is trial is false",
    },
    {
      expression: Lib.booleanFilterClause({
        operator: "=",
        column,
        values: [true],
      }),
      optionType: "is-null",
      expectedDisplayName: "Is trial is empty",
    },
  ])(
    'should allow to update a filter for "$optionType"',
    ({ expression, optionType, expectedDisplayName }) => {
      const query = Lib.filter(defaultQuery, stageIndex, expression);
      const [filter] = Lib.filters(query, stageIndex);

      const { result } = renderHook(() =>
        useBooleanOptionFilter({
          query: defaultQuery,
          stageIndex,
          column,
          filter,
        }),
      );

      act(() => {
        const { setOptionType } = result.current;
        setOptionType(optionType);
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
