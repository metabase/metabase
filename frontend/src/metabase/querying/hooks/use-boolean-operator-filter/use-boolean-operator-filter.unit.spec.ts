import { act, renderHook } from "@testing-library/react-hooks";
import { checkNotNull } from "metabase/lib/types";
import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { useBooleanOperatorFilter } from "./use-boolean-operator-filter";

interface CreateFilterCase {
  operator: Lib.BooleanFilterOperatorName;
  values: boolean[];
  displayName: string;
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
      displayName: "Is trial is true",
    },
  ])(
    'should allow to create a filter for "$operator" operator',
    ({ operator, values, displayName }) => {
      const { result } = renderHook(() =>
        useBooleanOperatorFilter({
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
});
