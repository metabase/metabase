import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { createMockNotebookStep } from "../../test-utils";
import type { NotebookStep } from "../../types";

import { FilterStep } from "./FilterStep";

const ADD_FILTER_TEXT = "Add filters to narrow your answer";

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
              { type: "column", name: "TOTAL" },
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

function createSummarizedQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
      {},
    ],
  });
}

interface SetupOpts {
  step?: NotebookStep;
  readOnly?: boolean;
  isLastOpened?: boolean;
}

function setup({
  step = createMockNotebookStep(),
  readOnly = false,
  isLastOpened = false,
}: SetupOpts = {}) {
  fetchMock.get("path:/api/prototype/field-categories", []);
  fetchMock.get("path:/api/prototype/filter-usage", []);
  fetchMock.get("path:/api/prototype/samples", { tables: [], columns: [] });
  const updateQuery = jest.fn((_query: Lib.Query) => Promise.resolve());

  renderWithProviders(
    <FilterStep
      step={step}
      stageIndex={step.stageIndex}
      query={step.query}
      color="core-filter"
      isLastOpened={isLastOpened}
      readOnly={readOnly}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  return { updateQuery };
}

const findOption = (label: string) =>
  within(screen.getByRole("listbox")).findByText(label);
const queryOption = (label: string) =>
  within(screen.getByRole("listbox")).queryByText(label);

describe("FilterStep", () => {
  it("should show the placeholder without filters", () => {
    setup();
    expect(screen.getByText(ADD_FILTER_TEXT)).toBeInTheDocument();
    expect(screen.getByTestId("filter-expression-bar")).toHaveAttribute(
      "data-variant",
      "notebook",
    );
  });

  it("should show the filters as pills", () => {
    const { query } = createQueryWithFilter();
    setup({ step: createMockNotebookStep({ query }) });
    const pill = screen.getByTestId("filter-pill");
    expect(within(pill).getByText("Total")).toBeInTheDocument();
    expect(within(pill).getByText("20")).toBeInTheDocument();
  });

  it("should keep the clause pills when read-only", () => {
    const { query } = createQueryWithFilter();
    setup({ step: createMockNotebookStep({ query }), readOnly: true });
    expect(screen.getByText("Total is greater than 20")).toBeInTheDocument();
    expect(
      screen.queryByTestId("filter-expression-bar"),
    ).not.toBeInTheDocument();
  });

  it("should add a filter typed in the bar", async () => {
    const { updateQuery } = setup();
    await userEvent.click(screen.getByTestId("filter-expression-bar"));
    await userEvent.type(screen.getByRole("textbox"), "Total");
    await userEvent.click(await findOption("Total"));
    await userEvent.click(await findOption(">"));
    await userEvent.type(screen.getByRole("textbox"), "20{Enter}");

    expect(updateQuery).toHaveBeenCalledTimes(1);
    const [nextQuery] = updateQuery.mock.calls[0];
    const [filter] = Lib.filters(nextQuery, 0);
    expect(Lib.displayInfo(nextQuery, 0, filter).displayName).toBe(
      "Total is greater than 20",
    );
  });

  describe("a summarized query", () => {
    it("should offer the raw columns on the rows stage, not the summary's", async () => {
      const query = createSummarizedQuery();
      setup({ step: createMockNotebookStep({ query, stageIndex: 0 }) });
      await userEvent.click(screen.getByTestId("filter-expression-bar"));

      expect(await findOption("Total")).toBeInTheDocument();
      expect(queryOption("Count")).not.toBeInTheDocument();
    });

    it("should offer the summary's columns on its stage, not the raw ones", async () => {
      const query = createSummarizedQuery();
      setup({ step: createMockNotebookStep({ query, stageIndex: 1 }) });
      await userEvent.click(screen.getByTestId("filter-expression-bar"));

      expect(await findOption("Count")).toBeInTheDocument();
      expect(queryOption("Total")).not.toBeInTheDocument();
    });
  });
});
