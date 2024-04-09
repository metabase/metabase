import userEvent from "@testing-library/user-event";

import { setupFieldValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import type { GetFieldValuesResponse } from "metabase-types/api";
import { createMockFieldValues } from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";

import { NumberFilterEditor } from "./NumberFilterEditor";

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  fieldValues?: GetFieldValuesResponse;
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

      await userEvent.click(screen.getByText("between"));
      await userEvent.click(await screen.findByText("Equal to"));
      await userEvent.click(await screen.findByText("2"));

      expect(getNextFilterName()).toBe("Quantity is equal to 2");
    });

    it("should handle non-searchable values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("between"));
      await userEvent.click(await screen.findByText("Equal to"));
      await userEvent.type(screen.getByPlaceholderText("Enter a number"), "15");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Total is equal to 15");
      expect(onInput).toHaveBeenCalled();
    });

    it("should handle primary keys", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column: findColumn("ORDERS", "ID"),
      });
      expect(screen.getByText("is")).toBeInTheDocument();

      await userEvent.type(screen.getByPlaceholderText("Enter an ID"), "15");
      await userEvent.tab();
      expect(getNextFilterName()).toBe("ID is 15");
    });

    it("should handle foreign keys", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column: findColumn("ORDERS", "PRODUCT_ID"),
      });
      expect(screen.getByText("is")).toBeInTheDocument();

      await userEvent.type(screen.getByPlaceholderText("Enter an ID"), "15");
      await userEvent.tab();
      expect(getNextFilterName()).toBe("Product ID is 15");
    });

    it("should add a filter with one value", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("between"));
      await userEvent.click(await screen.findByText("Less than"));
      await userEvent.type(screen.getByPlaceholderText("Enter a number"), "20");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Total is less than 20");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with two values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.type(screen.getByPlaceholderText("Min"), "10");
      await userEvent.type(screen.getByPlaceholderText("Max"), "20");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Total is between 10 and 20");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with no value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("between"));
      await userEvent.click(await screen.findByText("Is empty"));

      expect(getNextFilterName()).toBe("Total is empty");
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("between"));
      await userEvent.click(await screen.findByText("Greater than"));
      expect(getNextFilterName()).toBeNull();

      await userEvent.type(screen.getByPlaceholderText("Enter a number"), "10");
      await userEvent.clear(screen.getByPlaceholderText("Enter a number"));
      expect(getNextFilterName()).toBeNull();
    });

    it("should coerce invalid filter values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.type(screen.getByPlaceholderText("Min"), "10");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Total is greater than or equal to 10");
      expect(onInput).toHaveBeenCalled();
    });
  });

  describe("existing filter", () => {
    it("should handle list values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "ORDERS",
        columnName: "QUANTITY",
        operator: "=",
        values: [2],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
        fieldValues: createMockFieldValues({
          field_id: ORDERS.QUANTITY,
          values: [[1], [2], [3]],
          has_more_values: false,
        }),
      });
      expect(
        await screen.findByRole("checkbox", { name: "1" }),
      ).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "2" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "3" })).not.toBeChecked();

      await userEvent.click(screen.getByRole("checkbox", { name: "3" }));
      expect(screen.getByRole("checkbox", { name: "1" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "2" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "3" })).toBeChecked();
      expect(getNextFilterName()).toBe("Quantity is equal to 2 selections");
    });

    it("should handle non-searchable values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "ORDERS",
        columnName: "TOTAL",
        operator: "=",
        values: [10],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByDisplayValue("10")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText("Filter value"), "20");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Total is equal to 2 selections");
    });

    it("should update a filter with one value", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "ORDERS",
        columnName: "TOTAL",
        operator: ">",
        values: [10],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      await userEvent.clear(screen.getByDisplayValue("10"));
      await userEvent.type(screen.getByPlaceholderText("Enter a number"), "20");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Total is greater than 20");
    });

    it("should update a filter with two values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "ORDERS",
        columnName: "TOTAL",
        operator: "between",
        values: [10, 20],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      await userEvent.clear(screen.getByDisplayValue("10"));
      await userEvent.type(screen.getByPlaceholderText("Min"), "15");
      await userEvent.clear(screen.getByDisplayValue("20"));
      await userEvent.type(screen.getByPlaceholderText("Max"), "25");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Total is between 15 and 25");
    });

    it("should update a filter with no value", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        tableName: "ORDERS",
        columnName: "TOTAL",
        operator: "is-null",
        values: [],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      await userEvent.click(screen.getByText("is empty"));
      await userEvent.click(await screen.findByText("Not empty"));

      expect(getNextFilterName()).toBe("Total is not empty");
    });
  });
});

interface QueryWithFilterOpts {
  tableName: string;
  columnName: string;
  operator: Lib.NumberFilterOperatorName;
  values: number[];
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
    Lib.numberFilterClause({
      operator,
      column,
      values,
    }),
  );
  const [filter] = Lib.filters(query, stageIndex);

  return { query, stageIndex, column, filter };
}
