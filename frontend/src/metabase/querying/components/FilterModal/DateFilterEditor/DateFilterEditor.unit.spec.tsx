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
    it("should add a relative filter from a shortcut", () => {
      const { getNextFilterName } = setup({
        query: defaultQuery,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByRole("button", { name: "Last month" }));

      expect(getNextFilterName()).toBe("Created At is in the previous month");
    });

    it("should remove a relative filter from a shortcut", () => {
      const { query, filter } = createQueryWithFilter(
        defaultQuery,
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

      userEvent.click(button);
      expect(getNextFilterName()).toBeNull();
    });

    it("should add a relative filter not from a shortcut", async () => {
      const { getNextFilterName } = setup({
        query: defaultQuery,
        stageIndex,
        column,
      });

      userEvent.click(screen.getByRole("button", { name: "More options" }));
      userEvent.click(
        await screen.findByRole("button", { name: "Last 30 days" }),
      );

      expect(getNextFilterName()).toBe("Created At is in the previous 30 days");
    });

    it("should remove a relative filter not from a shortcut", async () => {
      const { query, filter } = createQueryWithFilter(
        defaultQuery,
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

      userEvent.click(screen.getByRole("button", { name: "Clear" }));

      expect(getNextFilterName()).toBe(null);
    });
  });
});

function createQueryWithFilter(
  initialQuery: Lib.Query,
  clause: Lib.ExpressionClause | Lib.SegmentMetadata,
) {
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);
  const column = Lib.filterParts(query, 0, filter)?.column;
  return { query, filter, column };
}
