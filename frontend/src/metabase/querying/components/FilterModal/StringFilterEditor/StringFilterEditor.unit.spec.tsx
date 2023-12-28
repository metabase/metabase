import userEvent from "@testing-library/user-event";
import {
  PEOPLE,
  PRODUCT_CATEGORY_VALUES,
} from "metabase-types/api/mocks/presets";
import { act, renderWithProviders, screen } from "__support__/ui";
import {
  setupFieldSearchValuesEndpoints,
  setupFieldValuesEndpoints,
} from "__support__/server-mocks";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { StringFilterEditor } from "./StringFilterEditor";

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

function setup({ query, stageIndex, column, filter }: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  setupFieldValuesEndpoints(PRODUCT_CATEGORY_VALUES);

  renderWithProviders(
    <StringFilterEditor
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isSearching={false}
      onChange={onChange}
      onInput={onInput}
    />,
  );

  const getNextFilter = () => {
    const [nextFilter] = onChange.mock.lastCall;
    return nextFilter;
  };

  return { onChange, onInput, getNextFilter };
}

describe("StringFilterEditor", () => {
  const query = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("PRODUCTS", "CATEGORY");

  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe("new filter", () => {
    it("should handle list values", async () => {
      const { getNextFilter, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(await screen.findByText("Gadget"));

      const filter = getNextFilter();
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName: "Category is Gadget",
      });
      expect(onInput).not.toHaveBeenCalled();
    });

    it("should handle searchable values", async () => {
      const searchValue = "t";
      const searchResult = "t@metabase.test";
      setupFieldSearchValuesEndpoints(PEOPLE.EMAIL, searchValue, [
        [searchResult],
      ]);

      const { getNextFilter, onInput } = setup({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "EMAIL"),
      });

      userEvent.type(
        screen.getByPlaceholderText("Search by Email"),
        searchValue,
      );
      act(() => jest.advanceTimersByTime(1000));
      userEvent.click(await screen.findByText(searchResult));

      const filter = getNextFilter();
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName: `Email is ${searchResult}`,
      });
      expect(onInput).not.toHaveBeenCalled();
    });

    it("should handle non-searchable values", async () => {
      const { getNextFilter, onInput } = setup({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "PASSWORD"),
      });

      userEvent.type(screen.getByPlaceholderText("Enter some text"), "Test");
      userEvent.click(document.body);

      const filter = getNextFilter();
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName: `Password is Test`,
      });
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with one value", async () => {
      const { getNextFilter, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("is"));
      userEvent.click(await screen.findByText("Starts with"));
      userEvent.type(screen.getByPlaceholderText("Enter some text"), "Ga");
      userEvent.click(document.body);

      const filter = getNextFilter();
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName: "Category starts with Ga",
      });
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with no value", async () => {
      const { getNextFilter } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("is"));
      userEvent.click(await screen.findByText("Is empty"));

      const filter = getNextFilter();
      expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
        displayName: "Category is empty",
      });
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilter } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("is"));
      userEvent.click(await screen.findByText("Starts with"));
      expect(getNextFilter()).toBeUndefined();

      userEvent.type(screen.getByPlaceholderText("Enter some text"), "Ga");
      userEvent.clear(screen.getByPlaceholderText("Enter some text"));
      expect(getNextFilter()).toBeUndefined();
    });
  });
});
