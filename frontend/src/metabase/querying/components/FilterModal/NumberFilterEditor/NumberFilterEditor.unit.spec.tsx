import userEvent from "@testing-library/user-event";
import { ORDERS_QUANTITY_VALUES } from "metabase-types/api/mocks/presets";
import { renderWithProviders, screen } from "__support__/ui";
import { setupFieldValuesEndpoints } from "__support__/server-mocks";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { NumberFilterEditor } from "./NumberFilterEditor";

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

function setup({ query, stageIndex, column, filter }: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  setupFieldValuesEndpoints(ORDERS_QUANTITY_VALUES);

  renderWithProviders(
    <NumberFilterEditor
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

describe("StringFilterEditor", () => {
  const query = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("ORDERS", "TOTAL");

  describe("new filter", () => {
    it("should handle list values", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column: findColumn("ORDERS", "QUANTITY"),
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Equal to"));
      userEvent.click(await screen.findByText("10"));

      expect(getNextFilterName()).toBe("Quantity is equal to 10");
    });

    it("should handle non-searchable values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Equal to"));
      userEvent.type(screen.getByPlaceholderText("Enter a number"), "15");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Total is equal to 15");
      expect(onInput).toHaveBeenCalled();
    });
  });
});
