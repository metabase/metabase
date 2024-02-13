import { render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import { createMockNotebookStep } from "../../test-utils";
import { FilterStep } from "./FilterStep";

function createQueryWithFilter() {
  const initialQuery = createQuery();
  const columns = Lib.filterableColumns(initialQuery, 0);
  const findColumn = columnFinder(initialQuery, columns);
  const totalColumn = findColumn("ORDERS", "TOTAL");
  const clause = Lib.expressionClause(">", [totalColumn, 20], null);
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);
  return { query, filter };
}

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
    <FilterStep
      step={step}
      query={step.query}
      topLevelQuery={step.topLevelQuery}
      color="filter"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );
}

describe("FilterStep", () => {
  it("should render without filters", () => {
    setup();
    expect(
      screen.getByText("Add filters to narrow your answer"),
    ).toBeInTheDocument();
  });

  it("should render filters", () => {
    const { query } = createQueryWithFilter();
    setup(createMockNotebookStep({ topLevelQuery: query }));
    expect(screen.getByText("Total is greater than 20")).toBeInTheDocument();
  });
});
