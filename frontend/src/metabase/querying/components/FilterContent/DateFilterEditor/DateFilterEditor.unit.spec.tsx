import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

import { DateFilterEditor } from "./DateFilterEditor";

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
    <DateFilterEditor
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

describe("DateFilterEditor", () => {
  const defaultQuery = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(defaultQuery, stageIndex);
  const findColumn = columnFinder(defaultQuery, availableColumns);
  const column = findColumn("ORDERS", "CREATED_AT");

  describe("new filter", () => {
    it("should add a relative date filter from a shortcut", async () => {
      const { getNextFilterName } = setup({
        query: defaultQuery,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByText("Last month"));

      expect(getNextFilterName()).toBe("Created At is in the previous month");
    });

    it("should remove a relative date filter from a shortcut", async () => {
      const { query, filter } = createQueryWithFilter(
        defaultQuery,
        stageIndex,
        Lib.relativeDateFilterClause({
          column,
          value: "current",
          bucket: "day",
          offsetValue: null,
          offsetBucket: null,
          options: {},
        }),
      );
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });

      const button = screen.getByRole("button", { name: "Today" });
      expect(button).toHaveAttribute("aria-selected", "true");

      await userEvent.click(button);
      expect(getNextFilterName()).toBeNull();
    });

    it("should add a relative date filter", async () => {
      const { getNextFilterName } = setup({
        query: defaultQuery,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(await screen.findByText("Last 30 days"));

      expect(getNextFilterName()).toBe("Created At is in the previous 30 days");
    });

    it("should remove a relative date filter", async () => {
      const { query, filter } = createQueryWithFilter(
        defaultQuery,
        stageIndex,
        Lib.relativeDateFilterClause({
          column,
          value: -30,
          bucket: "day",
          offsetValue: null,
          offsetBucket: null,
          options: {},
        }),
      );
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByText("Previous 30 Days")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Clear"));
      expect(getNextFilterName()).toBe(null);
    });

    it("should add a specific date filter", async () => {
      const { getNextFilterName } = setup({
        query: defaultQuery,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(await screen.findByText("Specific dates…"));
      await userEvent.click(screen.getByText("After"));
      await userEvent.clear(screen.getByLabelText("Date"));
      await userEvent.type(screen.getByLabelText("Date"), "Feb 15, 2020");
      await userEvent.click(screen.getByText("Add filter"));

      expect(getNextFilterName()).toBe("Created At is after Feb 15, 2020");
    });

    it("should remove a specific date filter", async () => {
      const { query, filter } = createQueryWithFilter(
        defaultQuery,
        stageIndex,
        Lib.specificDateFilterClause(defaultQuery, stageIndex, {
          operator: "=",
          column,
          values: [new Date(2020, 1, 15)],
          hasTime: false,
        }),
      );
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByText("Feb 15, 2020")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Clear"));
      expect(getNextFilterName()).toBe(null);
    });

    it("should add an exclude date filter", async () => {
      const { getNextFilterName } = setup({
        query: defaultQuery,
        stageIndex,
        column,
      });

      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(await screen.findByText("Exclude…"));
      await userEvent.click(screen.getByText("Hours of the day…"));
      await userEvent.click(screen.getByText("5 PM"));
      await userEvent.click(screen.getByText("Add filter"));

      expect(getNextFilterName()).toBe("Created At excludes the hour of 5 PM");
    });

    it("should remove an exclude date filter", async () => {
      const { query, filter } = createQueryWithFilter(
        defaultQuery,
        stageIndex,
        Lib.excludeDateFilterClause(defaultQuery, stageIndex, {
          operator: "!=",
          column,
          values: [17],
          bucket: "hour-of-day",
        }),
      );
      const { getNextFilterName } = setup({
        query,
        stageIndex,
        column,
        filter,
      });
      expect(screen.getByText("Excludes 5 PM")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Clear"));
      expect(getNextFilterName()).toBe(null);
    });
  });
});

function createQueryWithFilter(
  initialQuery: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause | Lib.SegmentMetadata,
) {
  const query = Lib.filter(initialQuery, stageIndex, clause);
  const [filter] = Lib.filters(query, stageIndex);
  return { query, filter };
}
