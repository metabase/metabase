import _userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

import { TimeseriesFilterPicker } from "./TimeseriesFilterPicker";

function findDateColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("ORDERS", "CREATED_AT");
}

function createDateFilter(query: Lib.Query) {
  return Lib.specificDateFilterClause(query, 0, {
    operator: "=",
    column: findDateColumn(query),
    values: [new Date(2020, 0, 10)],
    hasTime: false,
  });
}

function createQueryWithFilter(
  initialQuery: Lib.Query = createQuery(),
  clause = createDateFilter(initialQuery),
) {
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);
  const column = Lib.filterParts(query, 0, filter)?.column;
  return { query, column, filter };
}

interface SetupOpts {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

function setup({
  query = createQuery(),
  column = findDateColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <TimeseriesFilterPicker
      query={query}
      stageIndex={0}
      column={column}
      filter={filter}
      onChange={onChange}
    />,
  );

  const getNextFilterParts = () => {
    const [nextFilter] = onChange.mock.lastCall;
    return nextFilter ? Lib.filterParts(query, 0, nextFilter) : null;
  };

  return { onChange, getNextFilterParts };
}

describe("TimeseriesFilterPicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  it("should allow to add a filter", async () => {
    const { getNextFilterParts } = setup();

    await userEvent.click(screen.getByText("All time"));
    await userEvent.click(await screen.findByDisplayValue("All time"));
    await userEvent.click(await screen.findByText("Is empty"));
    await userEvent.click(screen.getByText("Apply"));

    expect(getNextFilterParts()).toMatchObject({
      operator: "is-null",
      column: expect.anything(),
      values: [],
    });
  });

  it("should allow to update a filter", async () => {
    const { query, column, filter } = createQueryWithFilter();
    const { getNextFilterParts } = setup({ query, column, filter });

    await userEvent.click(screen.getByText("Jan 10, 2020"));
    const input = await screen.findByLabelText("Date");
    await userEvent.clear(input);
    await userEvent.type(input, "Feb 20, 2020");
    await userEvent.click(screen.getByText("Apply"));

    expect(getNextFilterParts()).toMatchObject({
      operator: "=",
      column: expect.anything(),
      values: [new Date(2020, 1, 20)],
    });
  });

  it("should allow to remove a filter", async () => {
    const { query, column, filter } = createQueryWithFilter();
    const { getNextFilterParts } = setup({ query, column, filter });

    await userEvent.click(screen.getByText("Jan 10, 2020"));
    await userEvent.click(await screen.findByDisplayValue("On"));
    await userEvent.click(await screen.findByText("All time"));
    await userEvent.click(screen.getByText("Apply"));

    expect(getNextFilterParts()).toBeNull();
  });
});
