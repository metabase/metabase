import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";

import { FilterStep } from "./FilterStep";

function createQueryWithFilter() {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: [
          {
            type: "operator",
            operator: ">",
            args: [
              { type: "column", sourceName: "ORDERS", name: "TOTAL" },
              { type: "literal", value: 20 },
            ],
          },
        ],
      },
    ],
  });

  const [filter] = Lib.filters(query, 0);
  return { query, filter };
}

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  renderWithProviders(
    <FilterStep
      step={step}
      stageIndex={step.stageIndex}
      query={step.query}
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
    setup(createMockNotebookStep({ query }));
    expect(screen.getByText("Total is greater than 20")).toBeInTheDocument();
  });
});
