import userEvent from "@testing-library/user-event";
import type { FieldValuesResult } from "metabase-types/api";
import { createMockFieldValues } from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";
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
  fieldValues?: FieldValuesResult;
}

function setup({ query, stageIndex, column, filter, fieldValues }: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  if (fieldValues) {
    setupFieldValuesEndpoints(fieldValues);
  }

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
        fieldValues: createMockFieldValues({
          field_id: ORDERS.QUANTITY,
          values: [[1], [2], [3]],
          has_more_values: false,
        }),
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Equal to"));
      userEvent.click(await screen.findByText("2"));

      expect(getNextFilterName()).toBe("Quantity is equal to 2");
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

    it("should handle primary keys", () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column: findColumn("ORDERS", "ID"),
      });
      expect(screen.getByText("is")).toBeInTheDocument();

      userEvent.type(screen.getByPlaceholderText("Enter an ID"), "15");
      userEvent.click(document.body);
      expect(getNextFilterName()).toBe("ID is 15");
    });

    it("should handle foreign keys", () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column: findColumn("ORDERS", "PRODUCT_ID"),
      });
      expect(screen.getByText("is")).toBeInTheDocument();

      userEvent.type(screen.getByPlaceholderText("Enter an ID"), "15");
      userEvent.click(document.body);
      expect(getNextFilterName()).toBe("Product ID is 15");
    });

    it("should add a filter with one value", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Less than"));
      userEvent.type(screen.getByPlaceholderText("Enter a number"), "20");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Total is less than 20");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with two values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.type(screen.getByPlaceholderText("Min"), "10");
      userEvent.type(screen.getByPlaceholderText("Max"), "20");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Total is between 10 and 20");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with no value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Is empty"));

      expect(getNextFilterName()).toBe("Total is empty");
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("between"));
      userEvent.click(await screen.findByText("Greater than"));
      expect(getNextFilterName()).toBeNull();

      userEvent.type(screen.getByPlaceholderText("Enter a number"), "10");
      userEvent.clear(screen.getByPlaceholderText("Enter a number"));
      expect(getNextFilterName()).toBeNull();
    });
  });
});
