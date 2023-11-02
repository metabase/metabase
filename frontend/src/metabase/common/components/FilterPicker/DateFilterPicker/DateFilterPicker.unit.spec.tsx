import userEvent from "@testing-library/user-event";
import { checkNotNull } from "metabase/lib/types";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { DateFilterPicker } from "./DateFilterPicker";

const STAGE_INDEX = 0;
const COLUMN_NAME = "CREATED_AT";

function findDateColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, STAGE_INDEX);
  const findColumn = columnFinder(query, columns);
  return findColumn("PRODUCTS", "CREATED_AT");
}

function createFilteredQuery({
  operator = "=",
  values = [],
}: Partial<Lib.SpecificDateFilterParts>) {
  const initialColumn = createQuery();
  const column = findDateColumn(initialColumn);

  const clause = Lib.specificDateFilterClause(initialColumn, STAGE_INDEX, {
    operator,
    column,
    values,
  });

  const query = Lib.filter(initialColumn, STAGE_INDEX, clause);
  const [filter] = Lib.filters(query, STAGE_INDEX);

  return { query, column, filter };
}

interface SetupOpts {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isNew?: boolean;
}

function setup({
  query = createQuery(),
  column = findDateColumn(query),
  filter,
  isNew = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <DateFilterPicker
      query={query}
      stageIndex={STAGE_INDEX}
      column={column}
      filter={filter}
      isNew={isNew}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  const getNextFilterColumnName = () => {
    const [filter] = onChange.mock.lastCall;
    const filterParts = Lib.filterParts(query, STAGE_INDEX, filter);
    const column = checkNotNull(filterParts?.column);
    return Lib.displayInfo(query, STAGE_INDEX, column).name;
  };

  const getNextSpecificFilterParts = () => {
    const [filter] = onChange.mock.lastCall;
    return Lib.specificDateFilterParts(query, STAGE_INDEX, filter);
  };

  const getNextRelativeFilterParts = () => {
    const [filter] = onChange.mock.lastCall;
    return Lib.relativeDateFilterParts(query, STAGE_INDEX, filter);
  };

  const getNextExcludeFilterParts = () => {
    const [filter] = onChange.mock.lastCall;
    return Lib.excludeDateFilterParts(query, STAGE_INDEX, filter);
  };

  return {
    getNextFilterColumnName,
    getNextSpecificFilterParts,
    getNextRelativeFilterParts,
    getNextExcludeFilterParts,
  };
}

describe("DateFilterPicker", () => {
  it("should add a filter via shortcut", () => {
    const { getNextFilterColumnName, getNextRelativeFilterParts } = setup({
      isNew: true,
    });

    userEvent.click(screen.getByText("Today"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextRelativeFilterParts()).toMatchObject({
      column: expect.anything(),
      value: "current",
      bucket: "day",
    });
  });

  it("should add a specific date filter", () => {
    const { getNextFilterColumnName, getNextSpecificFilterParts } = setup({
      isNew: true,
    });

    userEvent.click(screen.getByText("Specific dates…"));
    userEvent.click(screen.getByText("On"));
    userEvent.clear(screen.getByLabelText("Date"));
    userEvent.type(screen.getByLabelText("Date"), "Feb 15, 2020");
    userEvent.click(screen.getByText("Add filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextSpecificFilterParts()).toMatchObject({
      operator: "=",
      column: expect.anything(),
      values: [new Date(2020, 1, 15)],
    });
  });

  it("should update a specific date filter", () => {
    const { query, column, filter } = createFilteredQuery({
      operator: "=",
      values: [new Date(2020, 1, 15)],
    });
    const { getNextFilterColumnName, getNextSpecificFilterParts } = setup({
      query,
      column,
      filter,
    });

    userEvent.click(screen.getByText("20"));
    userEvent.click(screen.getByText("Update filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextSpecificFilterParts()).toMatchObject({
      operator: "=",
      column: expect.anything(),
      values: [new Date(2020, 1, 20)],
    });
  });
});
