import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { DateFilterPicker } from "./DateFilterPicker";

const STAGE_INDEX = 0;

function findDateColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("PRODUCTS", "CREATED_AT");
}

interface SetupOpts {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  isNew?: boolean;
}

function setup({
  query = createQuery(),
  column = findDateColumn(query),
  isNew = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <DateFilterPicker
      query={query}
      stageIndex={STAGE_INDEX}
      column={column}
      isNew={isNew}
      onChange={onChange}
      onBack={onBack}
    />,
  );

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
    getNextSpecificFilterParts,
    getNextRelativeFilterParts,
    getNextExcludeFilterParts,
  };
}

describe("DateFilterPicker", () => {
  it("should add a filter via shortcut", () => {
    const { getNextRelativeFilterParts } = setup({ isNew: true });

    userEvent.click(screen.getByText("Today"));

    expect(getNextRelativeFilterParts()).toMatchObject({
      column: expect.anything(),
      value: "current",
      bucket: "day",
    });
  });

  it("should add a specific date filter", () => {
    const { getNextSpecificFilterParts } = setup({ isNew: true });

    userEvent.click(screen.getByText("Specific dates…"));
    userEvent.click(screen.getByText("After"));
    userEvent.clear(screen.getByLabelText("Date"));
    userEvent.type(screen.getByLabelText("Date"), "Feb 15, 2020");
    userEvent.click(screen.getByText("Add filter"));

    expect(getNextSpecificFilterParts).toHaveBeenCalledWith({
      operator: ">",
      column: expect.anything(),
      values: [new Date(2020, 1, 15)],
    });
  });
});
