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
  const column = findColumn("PRODUCTS", "CATEGORY");

  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe("new filter", () => {
    it("should handle list values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(await screen.findByText("Gadget"));

      expect(getNextFilterName()).toBe("Category is Gadget");
      expect(onInput).not.toHaveBeenCalled();
    });

    it("should handle searchable values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "EMAIL"),
      });

      setupFieldSearchValuesEndpoints(PEOPLE.EMAIL, "a", [["a@metabase.test"]]);
      userEvent.type(screen.getByPlaceholderText("Search by Email"), "a");
      act(() => jest.advanceTimersByTime(1000));
      userEvent.click(await screen.findByText("a@metabase.test"));

      expect(getNextFilterName()).toBe("Email is a@metabase.test");
      expect(onInput).not.toHaveBeenCalled();
    });

    it("should handle non-searchable values", () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "PASSWORD"),
      });

      userEvent.type(screen.getByPlaceholderText("Enter some text"), "Test");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Password is Test");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with one value", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("is"));
      userEvent.click(await screen.findByText("Starts with"));
      userEvent.type(screen.getByPlaceholderText("Enter some text"), "Ga");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Category starts with Ga");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with no value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("is"));
      userEvent.click(await screen.findByText("Is empty"));

      expect(getNextFilterName()).toBe("Category is empty");
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByText("is"));
      userEvent.click(await screen.findByText("Starts with"));
      expect(getNextFilterName()).toBeNull();

      userEvent.type(screen.getByPlaceholderText("Enter some text"), "Ga");
      userEvent.clear(screen.getByPlaceholderText("Enter some text"));
      expect(getNextFilterName()).toBeNull();
    });
  });

  describe("existing filter", () => {
    it("should handle list values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "PRODUCTS",
        columnName: "CATEGORY",
        operator: "=",
        values: ["Gadget"],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(
        await screen.findByRole("checkbox", { name: "Gadget" }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Widget" }),
      ).not.toBeChecked();

      userEvent.click(screen.getByRole("checkbox", { name: "Widget" }));
      expect(getNextFilterName()).toBe("Category is 2 selections");
    });

    it("should handle searchable values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "PEOPLE",
        columnName: "EMAIL",
        operator: "=",
        values: ["a@metabase.test"],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByText("a@metabase.test")).toBeInTheDocument();

      setupFieldSearchValuesEndpoints(PEOPLE.EMAIL, "b", [["b@metabase.test"]]);
      userEvent.type(screen.getByLabelText("Filter value"), "b");
      act(() => jest.advanceTimersByTime(1000));
      userEvent.click(await screen.findByText("b@metabase.test"));
      expect(getNextFilterName()).toBe("Email is 2 selections");
      expect(screen.getByText("a@metabase.test")).toBeInTheDocument();
      expect(screen.getByText("b@metabase.test")).toBeInTheDocument();
    });

    it("should handle non-searchable values", () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "PEOPLE",
        columnName: "PASSWORD",
        operator: "=",
        values: ["abc"],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByText("abc")).toBeInTheDocument();

      userEvent.type(screen.getByLabelText("Filter value"), "bcd");
      userEvent.click(document.body);

      expect(getNextFilterName()).toBe("Password is 2 selections");
      expect(screen.getByText("abc")).toBeInTheDocument();
      expect(screen.getByText("bcd")).toBeInTheDocument();
    });
  });
});

interface QueryWithFilterOpts {
  tableName: string;
  columnName: string;
  operator: Lib.StringFilterOperatorName;
  values: string[];
}

function createQueryWithFilter({
  tableName,
  columnName,
  operator,
  values,
}: QueryWithFilterOpts) {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const findColumn = columnFinder(
    defaultQuery,
    Lib.filterableColumns(defaultQuery, stageIndex),
  );
  const column = findColumn(tableName, columnName);
  const query = Lib.filter(
    defaultQuery,
    stageIndex,
    Lib.stringFilterClause({
      operator,
      column,
      values,
      options: {},
    }),
  );
  const [filter] = Lib.filters(query, stageIndex);

  return { query, stageIndex, column, filter };
}
