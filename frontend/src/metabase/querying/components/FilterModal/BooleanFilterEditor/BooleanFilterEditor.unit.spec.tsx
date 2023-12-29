import userEvent from "@testing-library/user-event";
import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { BooleanFilterEditor } from "./BooleanFilterEditor";

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

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

function setup({ query, stageIndex, column, filter }: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  renderWithProviders(
    <BooleanFilterEditor
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isSearching={false}
      onChange={onChange}
      onInput={onInput}
    />,
  );

  const getNextFilterName = () => {
    const [nextFilter] = onChange.mock.lastCall;
    return nextFilter
      ? Lib.displayInfo(query, stageIndex, nextFilter).displayName
      : null;
  };

  return { onChange, onInput, getNextFilterName };
}

describe("BooleanFilterEditor", () => {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("ORDERS", BOOLEAN_FIELD.name);

  describe("new filter", () => {
    it('should add a "true" filter', () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByRole("checkbox", { name: "True" }));

      expect(getNextFilterName()).toBe("Is trial is true");
      expect(screen.getByRole("checkbox", { name: "True" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "False" })).not.toBeChecked();
      expect(screen.queryByText("is")).not.toBeInTheDocument();
    });

    it('should add a "false" filter', () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByRole("checkbox", { name: "False" }));

      expect(getNextFilterName()).toBe("Is trial is false");
      expect(screen.getByRole("checkbox", { name: "True" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "False" })).toBeChecked();
      expect(screen.queryByText("is")).not.toBeInTheDocument();
    });

    it("should allow to remove a filter", () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByRole("checkbox", { name: "True" }));
      userEvent.click(screen.getByRole("checkbox", { name: "True" }));
      expect(screen.getByRole("checkbox", { name: "True" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "False" })).not.toBeChecked();
      expect(getNextFilterName()).toBeNull();

      userEvent.click(screen.getByRole("checkbox", { name: "False" }));
      userEvent.click(screen.getByRole("checkbox", { name: "False" }));
      expect(screen.getByRole("checkbox", { name: "True" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "False" })).not.toBeChecked();
      expect(getNextFilterName()).toBeNull();
    });
  });
});
