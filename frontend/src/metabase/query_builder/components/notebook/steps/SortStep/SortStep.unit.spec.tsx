import userEvent from "@testing-library/user-event";

import { render, screen, getIcon, queryIcon } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";

import { createMockNotebookStep } from "../../test-utils";

import SortStep from "./SortStep";

function createQueryWithOrderBy(direction: Lib.OrderByDirection = "asc") {
  const initialQuery = createQuery();
  const [column] = Lib.orderableColumns(initialQuery, 0);
  const query = Lib.orderBy(initialQuery, 0, column, direction);
  return { query, columnInfo: Lib.displayInfo(query, 0, column) };
}

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
    <SortStep
      step={step}
      stageIndex={step.stageIndex}
      query={step.query}
      color="brand"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  function getNextQuery() {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  }

  function gerRecentOrderByClause() {
    const query = getNextQuery();
    const clause = Lib.orderBys(query, 0)[0];
    return Lib.displayInfo(query, 0, clause);
  }

  return { getNextQuery, gerRecentOrderByClause, updateQuery };
}

describe("SortStep", () => {
  it("should render correctly without an order by", () => {
    setup();
    expect(getIcon("add")).toBeInTheDocument();
    expect(queryIcon("arrow_up")).not.toBeInTheDocument();
    expect(queryIcon("arrow_down")).not.toBeInTheDocument();
  });

  it("should render correctly with ascending order by", () => {
    const { query, columnInfo } = createQueryWithOrderBy();

    setup(createMockNotebookStep({ query }));

    expect(screen.getByText(columnInfo.displayName)).toBeInTheDocument();
    expect(getIcon("arrow_up")).toBeInTheDocument();
    expect(queryIcon("arrow_down")).not.toBeInTheDocument();
  });

  it("should render correctly with descending order by", () => {
    const { query, columnInfo } = createQueryWithOrderBy("desc");

    setup(createMockNotebookStep({ query }));

    expect(screen.getByText(columnInfo.displayName)).toBeInTheDocument();
    expect(getIcon("arrow_down")).toBeInTheDocument();
    expect(queryIcon("arrow_up")).not.toBeInTheDocument();
  });

  it("should display orderable columns", async () => {
    setup();

    await userEvent.click(getIcon("add"));

    // Tables
    expect(await screen.findByText("Order")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    // Order columns
    expect(screen.getByRole("option", { name: "ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "User ID" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Total" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Created At" }),
    ).toBeInTheDocument();
  });

  it("should add an order by", async () => {
    const { gerRecentOrderByClause } = setup();

    await userEvent.click(getIcon("add"));
    await userEvent.click(await screen.findByText("Created At"));

    const orderBy = gerRecentOrderByClause();
    expect(orderBy.displayName).toBe("Created At");
    expect(orderBy.direction).toBe("asc");
  });

  it("shouldn't show already used columns when adding a new order-by", async () => {
    const { query, columnInfo } = createQueryWithOrderBy();
    setup(createMockNotebookStep({ query }));

    await userEvent.click(getIcon("add"));

    expect(
      screen.queryByRole("option", { name: columnInfo.displayName }),
    ).not.toBeInTheDocument();
  });

  it("should toggle an order by direction", async () => {
    const { query, columnInfo } = createQueryWithOrderBy();
    const { gerRecentOrderByClause } = setup(createMockNotebookStep({ query }));

    await userEvent.click(screen.getByLabelText("Change direction"));

    const orderBy = gerRecentOrderByClause();
    expect(orderBy.direction).toBe("desc");
    expect(orderBy.displayName).toBe(columnInfo.displayName);
  });

  it("should change ordered field", async () => {
    const { query, columnInfo } = createQueryWithOrderBy();
    const { gerRecentOrderByClause } = setup(createMockNotebookStep({ query }));

    await userEvent.click(screen.getByText(columnInfo.displayName));
    await userEvent.click(screen.getByText("Created At"));

    const orderBy = gerRecentOrderByClause();
    expect(orderBy.displayName).toBe("Created At");
  });

  it("should remove an order by", async () => {
    const { query } = createQueryWithOrderBy();
    const { getNextQuery } = setup(createMockNotebookStep({ query }));

    await userEvent.click(getIcon("close"));

    const nextQuery = getNextQuery();
    expect(Lib.orderBys(nextQuery, 0)).toHaveLength(0);
  });
});
