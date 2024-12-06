import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { columnFinder } from "metabase-lib/test-helpers";

import {
  createQuery,
  createQueryWithExcludeDateFilter,
  createQueryWithRelativeDateFilter,
  createQueryWithSpecificDateFilter,
  findDateTimeColumn,
} from "../test-utils";

import { DateFilterPicker } from "./DateFilterPicker";

const STAGE_INDEX = 0;
const COLUMN_NAME = "CREATED_AT";

interface SetupOpts {
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isNew?: boolean;
}

function setup({ query, column, filter, isNew = false }: SetupOpts) {
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
  const initialQuery = createQuery();
  const findColumn = columnFinder(
    initialQuery,
    Lib.filterableColumns(initialQuery, -1),
  );
  const column = findDateTimeColumn(initialQuery);

  it("should add a filter via shortcut", async () => {
    const { getNextFilterColumnName, getNextRelativeFilterParts } = setup({
      query: initialQuery,
      column,
      isNew: true,
    });

    await userEvent.click(screen.getByText("Today"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextRelativeFilterParts()).toMatchObject({
      column: expect.anything(),
      value: "current",
      unit: "day",
    });
  });

  it("should add a specific date filter", async () => {
    const { getNextFilterColumnName, getNextSpecificFilterParts } = setup({
      query: initialQuery,
      column,
      isNew: true,
    });

    await userEvent.click(screen.getByText("Specific dates…"));
    await userEvent.click(screen.getByText("On"));
    await userEvent.clear(screen.getByLabelText("Date"));
    await userEvent.type(screen.getByLabelText("Date"), "Feb 15, 2020");
    await userEvent.click(screen.getByText("Add filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextSpecificFilterParts()).toMatchObject({
      operator: "=",
      column: expect.anything(),
      values: [new Date(2020, 1, 15)],
    });
  });

  it("should update a specific date filter", async () => {
    const { query, filter } = createQueryWithSpecificDateFilter({
      query: initialQuery,
    });
    const { getNextFilterColumnName, getNextSpecificFilterParts } = setup({
      query,
      column,
      filter,
    });

    await userEvent.click(screen.getByText("20"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextSpecificFilterParts()).toMatchObject({
      operator: "=",
      column: expect.anything(),
      values: [new Date(2020, 1, 20)],
    });
  });

  it("should add a relative date filter", async () => {
    const { getNextFilterColumnName, getNextRelativeFilterParts } = setup({
      query: initialQuery,
      column,
      isNew: true,
    });

    await userEvent.click(screen.getByText("Relative dates…"));
    await userEvent.clear(screen.getByLabelText("Interval"));
    await userEvent.type(screen.getByLabelText("Interval"), "20");
    await userEvent.click(screen.getByText("Add filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextRelativeFilterParts()).toMatchObject({
      column: expect.anything(),
      value: -20,
      unit: "day",
      offsetValue: null,
      offsetUnit: null,
    });
  });

  it("should update a relative date filter", async () => {
    const { query, filter } = createQueryWithRelativeDateFilter({
      query: initialQuery,
    });
    const { getNextFilterColumnName, getNextRelativeFilterParts } = setup({
      query,
      column,
      filter,
    });

    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextRelativeFilterParts()).toMatchObject({
      value: 20,
      unit: "day",
      offsetValue: null,
      offsetUnit: null,
    });
  });

  it("should add an exclude date filter", async () => {
    const { getNextFilterColumnName, getNextExcludeFilterParts } = setup({
      query: initialQuery,
      column,
      isNew: true,
    });

    await userEvent.click(screen.getByText("Exclude…"));
    await userEvent.click(screen.getByText("Days of the week…"));
    await userEvent.click(screen.getByText("Monday"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextExcludeFilterParts()).toMatchObject({
      column: expect.anything(),
      operator: "!=",
      values: [1],
      unit: "day-of-week",
    });
  });

  it("should update an exclude date filter", async () => {
    const { query, filter } = createQueryWithExcludeDateFilter({
      query: initialQuery,
    });
    const { getNextFilterColumnName, getNextExcludeFilterParts } = setup({
      query,
      column,
      filter,
    });

    await userEvent.click(screen.getByText("Monday"));
    await userEvent.click(screen.getByText("Wednesday"));
    await userEvent.click(screen.getByText("Friday"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(getNextFilterColumnName()).toBe(COLUMN_NAME);
    expect(getNextExcludeFilterParts()).toMatchObject({
      column: expect.anything(),
      operator: "!=",
      values: [3, 5],
      unit: "day-of-week",
    });
  });

  it("should not allow to set time for a date only column", async () => {
    setup({
      query: initialQuery,
      column: findColumn("PEOPLE", "BIRTH_DATE"),
      isNew: true,
    });

    await userEvent.click(screen.getByText("Specific dates…"));
    await userEvent.click(screen.getByText("On"));
    expect(screen.queryByText("Add time")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Back"));
    await userEvent.click(screen.getByText("Relative dates…"));
    await userEvent.click(screen.getByDisplayValue("days"));
    expect(screen.getByText("days")).toBeInTheDocument();
    expect(screen.queryByText("hours")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Back"));
    await userEvent.click(screen.getByText("Exclude…"));
    expect(screen.getByText("Days of the week…")).toBeInTheDocument();
    expect(screen.queryByText("Hours of the day…")).not.toBeInTheDocument();
  });
});
