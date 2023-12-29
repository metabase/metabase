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
import { TimeFilterEditor } from "./TimeFilterEditor";

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
    <TimeFilterEditor
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

describe("TimeFilterEditor", () => {
  const query = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("ORDERS", TIME_FIELD.name);

  describe("new filter", () => {
    it("should add a filter with one value", () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.clear(screen.getByPlaceholderText("Enter a time"));
      userEvent.type(screen.getByPlaceholderText("Enter a time"), "10:20");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Time is before 10:20 AM");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with two values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("before"));
      userEvent.click(await screen.findByText("Between"));
      userEvent.clear(screen.getByPlaceholderText("Min"));
      userEvent.type(screen.getByPlaceholderText("Min"), "10:15");
      userEvent.clear(screen.getByPlaceholderText("Max"));
      userEvent.type(screen.getByPlaceholderText("Max"), "20:40");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Time is 10:15 AM – 8:40 PM");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with no value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("before"));
      userEvent.click(await screen.findByText("Is empty"));

      expect(getNextFilterName()).toBe("Time is empty");
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.clear(screen.getByPlaceholderText("Enter a time"));
      userEvent.click(document.body);

      expect(getNextFilterName()).toBeNull();
    });
  });
});
