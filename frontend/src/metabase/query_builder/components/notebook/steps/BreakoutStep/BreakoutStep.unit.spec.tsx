import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, getIcon, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockNotebookStep } from "../../test-utils";
import BreakoutStep from "./BreakoutStep";

console.error = jest.fn();

function createQueryWithBreakout() {
  const initialQuery = createQuery();
  const findColumn = columnFinder(
    initialQuery,
    Lib.breakoutableColumns(initialQuery),
  );
  const column = findColumn("ORDERS", "TAX");
  const query = Lib.breakout(initialQuery, column);
  return { query, columnInfo: Lib.displayInfo(query, column) };
}

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
    <BreakoutStep
      step={step}
      query={step.query}
      topLevelQuery={step.topLevelQuery}
      color="summarize"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  function getNextQuery() {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  }

  function getRecentBreakoutClause() {
    const query = getNextQuery();
    const clause = Lib.breakouts(query)[0];
    return Lib.displayInfo(query, clause);
  }

  return {
    getNextQuery,
    getRecentBreakoutClause,
    updateQuery,
  };
}

describe("BreakoutStep", () => {
  it("should render correctly without a breakout", () => {
    setup();
    expect(screen.getByText("Pick a column to group by")).toBeInTheDocument();
  });

  it("should render a breakout correctly", () => {
    const { query, columnInfo } = createQueryWithBreakout();
    const columnName = columnInfo.displayName;
    setup(createMockNotebookStep({ topLevelQuery: query }));

    userEvent.click(screen.getByText(columnName));

    const listItem = screen.getByRole("option", { name: columnName });
    expect(listItem).toBeInTheDocument();
    expect(listItem).toHaveAttribute("aria-selected", "true");
  });

  it("shouldn't show already used columns when adding a new breakout", () => {
    const { query, columnInfo } = createQueryWithBreakout();
    setup(createMockNotebookStep({ topLevelQuery: query }));

    userEvent.click(getIcon("add"));

    expect(
      screen.queryByRole("option", { name: columnInfo.displayName }),
    ).not.toBeInTheDocument();
  });

  it("should add a breakout", () => {
    const { getRecentBreakoutClause } = setup();

    userEvent.click(screen.getByText("Pick a column to group by"));
    userEvent.click(screen.getByText("Created At"));

    const breakout = getRecentBreakoutClause();
    expect(breakout.displayName).toBe("Created At");
  });

  it("should change a breakout column", () => {
    const { query, columnInfo } = createQueryWithBreakout();
    const { getRecentBreakoutClause } = setup(
      createMockNotebookStep({ topLevelQuery: query }),
    );

    userEvent.click(screen.getByText(columnInfo.displayName));
    userEvent.click(screen.getByText("Discount"));

    const breakout = getRecentBreakoutClause();
    expect(breakout.displayName).toBe("Discount");
  });

  it("should remove a breakout", () => {
    const { query } = createQueryWithBreakout();
    const { getNextQuery } = setup(
      createMockNotebookStep({ topLevelQuery: query }),
    );

    userEvent.click(getIcon("close"));

    const nextQuery = getNextQuery();
    expect(Lib.breakouts(nextQuery)).toHaveLength(0);
  });

  describe("bucketing", () => {
    it("should apply selected binning strategy", async () => {
      const { getRecentBreakoutClause } = setup();

      userEvent.click(screen.getByText("Pick a column to group by"));
      const option = screen.getByRole("option", { name: "Total" });
      userEvent.click(within(option).getByLabelText("Binning strategy"));
      userEvent.click(await screen.findByRole("menuitem", { name: "10 bins" }));

      const breakout = getRecentBreakoutClause();
      expect(breakout.displayName).toBe("Total: 10 bins");
    });

    it("should apply default binning strategy", async () => {
      const { getRecentBreakoutClause } = setup();

      userEvent.click(screen.getByText("Pick a column to group by"));
      userEvent.click(screen.getByText("Total"));

      const breakout = getRecentBreakoutClause();
      expect(breakout.displayName).toBe("Total");
    });

    it("should apply default temporal bucket", async () => {
      const { getRecentBreakoutClause } = setup();

      userEvent.click(screen.getByText("Pick a column to group by"));
      userEvent.click(screen.getByText("Created At"));

      const breakout = getRecentBreakoutClause();
      expect(breakout.displayName).toBe("Created At");
    });

    it("should apply selected temporal bucket", async () => {
      const { getRecentBreakoutClause } = setup();

      userEvent.click(screen.getByText("Pick a column to group by"));
      const option = screen.getByRole("option", { name: "Created At" });
      userEvent.click(within(option).getByLabelText("Temporal bucket"));
      userEvent.click(await screen.findByRole("menuitem", { name: "Quarter" }));

      const breakout = getRecentBreakoutClause();
      expect(breakout.displayName).toBe("Created At (quarter)");
    });
  });
});
