import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  createOrdersIdField,
  createOrdersTable,
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";

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
    it("should add a filter with one value", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.clear(screen.getByPlaceholderText("Enter a time"));
      await userEvent.type(
        screen.getByPlaceholderText("Enter a time"),
        "10:20",
      );
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Time is before 10:20 AM");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with two values", async () => {
      const { getNextFilterName, onInput } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("before"));
      await userEvent.click(await screen.findByText("Between"));
      await userEvent.clear(screen.getByPlaceholderText("Min"));
      await userEvent.type(screen.getByPlaceholderText("Min"), "10:15");
      await userEvent.clear(screen.getByPlaceholderText("Max"));
      await userEvent.type(screen.getByPlaceholderText("Max"), "20:40");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Time is 10:15 AM – 8:40 PM");
      expect(onInput).toHaveBeenCalled();
    });

    it("should add a filter with no value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("before"));
      await userEvent.click(await screen.findByText("Is empty"));

      expect(getNextFilterName()).toBe("Time is empty");
    });

    it("should not accept an empty string as a value", async () => {
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
      });

      await userEvent.clear(screen.getByPlaceholderText("Enter a time"));
      await userEvent.tab();

      expect(getNextFilterName()).toBeNull();
    });
  });

  describe("existing filter", () => {
    it("should update a filter with one value", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: ">",
        values: [new Date(2020, 0, 1, 10, 20)],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      await userEvent.clear(screen.getByDisplayValue("10:20"));
      await userEvent.type(
        screen.getByPlaceholderText("Enter a time"),
        "11:40",
      );
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Time is after 11:40 AM");
    });

    it("should update a filter with two values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "between",
        values: [new Date(2020, 0, 1, 10, 20), new Date(2020, 0, 1, 12, 40)],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      await userEvent.clear(screen.getByDisplayValue("10:20"));
      await userEvent.type(screen.getByPlaceholderText("Min"), "11:40");
      await userEvent.clear(screen.getByDisplayValue("12:40"));
      await userEvent.type(screen.getByPlaceholderText("Max"), "15:10");
      await userEvent.tab();

      expect(getNextFilterName()).toBe("Time is 11:40 AM – 3:10 PM");
    });

    it("should update a filter with no values", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
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

      expect(getNextFilterName()).toBe("Time is not empty");
    });

    it("should preserve values when switching operators", async () => {
      const { query, stageIndex, column, filter } = createQueryWithFilter({
        operator: "<",
        values: [new Date(2020, 0, 1, 10, 20)],
      });
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      await userEvent.click(screen.getByText("before"));
      await userEvent.click(await screen.findByText("After"));

      expect(getNextFilterName()).toBe("Time is after 10:20 AM");
    });
  });
});

interface QueryWithFilterOpts {
  operator: Lib.TimeFilterOperatorName;
  values: Date[];
}

function createQueryWithFilter({ operator, values }: QueryWithFilterOpts) {
  const defaultQuery = createQuery({ metadata: METADATA });
  const stageIndex = 0;
  const findColumn = columnFinder(
    defaultQuery,
    Lib.filterableColumns(defaultQuery, stageIndex),
  );
  const column = findColumn("ORDERS", TIME_FIELD.name);
  const query = Lib.filter(
    defaultQuery,
    stageIndex,
    Lib.timeFilterClause({
      operator,
      column,
      values,
    }),
  );
  const [filter] = Lib.filters(query, stageIndex);

  return { query, stageIndex, column, filter };
}
