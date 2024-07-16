import userEvent from "@testing-library/user-event";

import {
  setupFieldSearchValuesEndpoint,
  setupFieldValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import type { GetFieldValuesResponse } from "metabase-types/api";
import { createMockFieldValues } from "metabase-types/api/mocks";
import {
  PEOPLE,
  PEOPLE_STATE_VALUES,
  PRODUCT_CATEGORY_VALUES,
} from "metabase-types/api/mocks/presets";

import { StringFilterEditor } from "./StringFilterEditor";

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  fieldValues?: GetFieldValuesResponse;
  searchValues?: Record<string, GetFieldValuesResponse>;
}

function setup({
  query,
  stageIndex,
  column,
  filter,
  fieldValues = PRODUCT_CATEGORY_VALUES,
  searchValues = {},
}: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  if (fieldValues) {
    setupFieldValuesEndpoints(fieldValues);
  }
  Object.entries(searchValues).forEach(([value, result]) => {
    setupFieldSearchValuesEndpoint(
      result.field_id,
      result.field_id,
      value,
      result.values,
    );
  });

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

  describe("new filter", () => {
    it("should handle list values when they are rendered as a list of checkboxes", async () => {
      const { getNextFilterName, onChange } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(await screen.findByText("Gadget"));
      expect(getNextFilterName()).toBe("Category is Gadget");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("should handle list values when they are rendered as an autocomplete input", async () => {
      const { getNextFilterName, onChange, onInput } = setup({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "STATE"),
        fieldValues: PEOPLE_STATE_VALUES,
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "T");
      await userEvent.click(await screen.findByText("TX"));
      expect(onInput).toHaveBeenCalled();

      await userEvent.tab();
      expect(getNextFilterName()).toBe("State is TX");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("should handle searchable values", async () => {
      const { getNextFilterName, onChange, onInput } = setup({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "EMAIL"),
        searchValues: {
          "a@metabase": createMockFieldValues({
            field_id: PEOPLE.EMAIL,
            values: [["a@metabase.test"]],
          }),
        },
      });

      await userEvent.click(screen.getByText("contains"));
      await userEvent.click(screen.getByText("Is"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(getNextFilterName()).toBeNull();

      await userEvent.type(
        screen.getByPlaceholderText("Search by Email"),
        "a@metabase",
      );
      await userEvent.click(await screen.findByText("a@metabase.test"));
      expect(onInput).toHaveBeenCalled();

      await userEvent.tab();
      expect(getNextFilterName()).toBe("Email is a@metabase.test");
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("should handle non-searchable values", async () => {
      const { getNextFilterName, onChange, onInput } = setup({
        query,
        stageIndex,
        column: findColumn("PEOPLE", "PASSWORD"),
      });

      await userEvent.click(screen.getByText("contains"));
      await userEvent.click(screen.getByText("Is"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(getNextFilterName()).toBeNull();

      await userEvent.type(
        screen.getByPlaceholderText("Enter some text"),
        "Test",
      );
      expect(onInput).toHaveBeenCalled();

      await userEvent.tab();
      expect(getNextFilterName()).toBe("Password is Test");
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("should add a filter with one value", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("is"));
      await userEvent.click(await screen.findByText("Starts with"));
      await userEvent.type(
        screen.getByPlaceholderText("Enter some text"),
        "Ga",
      );
      expect(onInput).toHaveBeenCalled();

      await userEvent.tab();
      expect(getNextFilterName()).toBe("Category starts with Ga");
    });

    it("should add a filter with no value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("is"));
      await userEvent.click(await screen.findByText("Is empty"));

      expect(getNextFilterName()).toBe("Category is empty");
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("is"));
      await userEvent.click(await screen.findByText("Starts with"));
      expect(getNextFilterName()).toBeNull();

      await userEvent.type(
        screen.getByPlaceholderText("Enter some text"),
        "Ga",
      );
      await userEvent.clear(screen.getByPlaceholderText("Enter some text"));
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

      await userEvent.click(screen.getByRole("checkbox", { name: "Widget" }));
      expect(getNextFilterName()).toBe("Category is 2 selections");
    });

    it("should handle searchable values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "PEOPLE",
        columnName: "EMAIL",
        operator: "=",
        values: ["a@metabase.test"],
      });
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
        filter,
        searchValues: {
          b: createMockFieldValues({
            field_id: PEOPLE.EMAIL,
            values: [["b@metabase.test"]],
          }),
        },
      });
      expect(screen.getByText("a@metabase.test")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText("Filter value"), "b");
      await userEvent.click(await screen.findByText("b@metabase.test"));
      expect(onInput).toHaveBeenCalled();

      await userEvent.tab();
      expect(getNextFilterName()).toBe("Email is 2 selections");
      expect(screen.getByText("a@metabase.test")).toBeInTheDocument();
      expect(screen.getByText("b@metabase.test")).toBeInTheDocument();
    });

    it("should handle non-searchable values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "PEOPLE",
        columnName: "PASSWORD",
        operator: "=",
        values: ["abc"],
      });
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByText("abc")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText("Filter value"), "bcd");
      expect(onInput).toHaveBeenCalled();

      await userEvent.tab();
      expect(getNextFilterName()).toBe("Password is 2 selections");
      expect(screen.getByText("abc")).toBeInTheDocument();
      expect(screen.getByText("bcd")).toBeInTheDocument();
    });

    it("should update a filter with one value", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "PRODUCTS",
        columnName: "CATEGORY",
        operator: "starts-with",
        values: ["Ga"],
      });
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      const input = screen.getByLabelText("Filter value");
      await userEvent.type(input, "{backspace}Wi");
      expect(onInput).toHaveBeenCalled();

      await userEvent.tab();
      expect(getNextFilterName()).toBe("Category starts with Wi");
    });

    it("should preserve values when changing the filter operator", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "PRODUCTS",
        columnName: "CATEGORY",
        operator: "starts-with",
        values: ["Ga"],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      await userEvent.click(screen.getByText("starts with"));
      await userEvent.click(await screen.findByText("Ends with"));

      expect(getNextFilterName()).toBe("Category ends with Ga");
      expect(screen.getByDisplayValue("Ga")).toBeInTheDocument();
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
