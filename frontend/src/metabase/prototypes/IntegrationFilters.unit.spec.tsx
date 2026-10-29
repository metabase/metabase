import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import {
  setupDatabaseEndpoints,
  setupPrototypeSamplesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  FilterAutoApplyContext,
  type FilterAutoApplyContextValue,
} from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createMockDataset } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { IntegrationFilters } from "./IntegrationFilters";
import {
  withDnfExample,
  withNestedExample,
  withOrExample,
} from "./or-filters/harness/examples";

interface SetupOpts {
  summarized?: boolean;
  autoApply?: boolean;
  summaryFilter?: boolean;
}

function Harness({
  initialQuery,
  autoApply,
  onChange,
}: {
  initialQuery: Lib.Query;
  autoApply: boolean;
  onChange: (query: Lib.Query) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const value: FilterAutoApplyContextValue = {
    isEnabled: () => autoApply,
    apply: () => {
      throw new Error("A nested token must update its boolean expression");
    },
    typedValuesApplyMode: "pause",
    typingPauseMs: 10,
  };
  return (
    <FilterAutoApplyContext.Provider value={value}>
      <IntegrationFilters
        query={query}
        onChange={(nextQuery) => {
          onChange(nextQuery);
          setQuery(nextQuery);
        }}
      />
      {/* other editors: the summary sidebar, and a drill on the chart */}
      <button
        onClick={() =>
          setQuery(Lib.aggregate(query, 0, Lib.expressionClause("count", [])))
        }
      >
        Change summary
      </button>
      <button onClick={() => setQuery(withDnfExample(query, 0))}>
        Replace filters
      </button>
    </FilterAutoApplyContext.Provider>
  );
}

/** The expression's own parentheses, not the list's "(" option. */
function getOpenParens() {
  return screen
    .queryAllByTitle("Click to remove")
    .filter((paren) => paren.textContent === "(");
}

function getRowFilterInput() {
  return screen.getAllByRole("textbox", { name: "Filter expression" })[0];
}

async function typeOpenParen() {
  await userEvent.click(getRowFilterInput());
  await userEvent.keyboard("(");
  expect(getOpenParens()).toHaveLength(1);
}

function setup({
  summarized = false,
  autoApply = false,
  summaryFilter = false,
}: SetupOpts = {}) {
  setupDatabaseEndpoints(createSampleDatabase());
  setupPrototypeSamplesEndpoint();
  let query = withOrExample(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    0,
  );
  if (summarized) {
    query = Lib.aggregate(query, 0, Lib.expressionClause("count", []));
  }
  if (summaryFilter) {
    query = Lib.appendStage(query);
    const [count] = Lib.filterableColumns(query, 1);
    query = Lib.filter(
      query,
      1,
      Lib.numberFilterClause({ operator: ">=", column: count, values: [3] }),
    );
  }
  const onChange = jest.fn((nextQuery: Lib.Query) => nextQuery);
  renderWithProviders(
    <Harness initialQuery={query} autoApply={autoApply} onChange={onChange} />,
  );
  return { query, onChange };
}

describe("integrated OR filters", () => {
  it("applies a valid operator change automatically on fast data", async () => {
    const { onChange } = setup({ summarized: true, autoApply: true });
    await userEvent.click(screen.getByText("or"));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const nextQuery = onChange.mock.calls[0][0];
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
  });

  it("applies a nested widget edit without losing its OR group", async () => {
    const { onChange } = setup({ summarized: true, autoApply: true });
    await userEvent.click(screen.getByText(/Total.*100/));
    const input = await screen.findByDisplayValue("100");
    await userEvent.clear(input);
    await userEvent.type(input, "200");
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const lastCall = onChange.mock.calls.at(-1);
    if (lastCall == null) {
      throw new Error("Expected a query update");
    }
    const nextQuery = lastCall[0];
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
    expect(
      Lib.expressionParts(nextQuery, 0, Lib.filters(nextQuery, 0)[0]).operator,
    ).toBe("or");
    expect(
      Lib.displayInfo(nextQuery, 0, Lib.filters(nextQuery, 0)[0])
        .longDisplayName,
    ).toContain("200");
  });
  it("shows summary-output filters as pills in the same bar, without stages", () => {
    const { onChange } = setup({ summarized: true, summaryFilter: true });

    expect(screen.queryByText(/^Stage \d/)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("textbox", { name: "Filter expression" }),
    ).toHaveLength(1);
    expect(screen.getByText(/Count.*3/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies an operator edit while preserving the summary", async () => {
    const { onChange } = setup({ summarized: true });

    await userEvent.click(screen.getByText("or"));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextQuery = onChange.mock.calls[0][0];
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(2);
    expect(Lib.stageCount(nextQuery)).toBe(1);
  });

  it("keeps a widget edit in the OR draft until Apply", async () => {
    const { onChange } = setup({ summarized: true });

    await userEvent.click(screen.getByText(/Total.*100/));
    const input = await screen.findByDisplayValue("100");
    await userEvent.clear(input);
    await userEvent.type(input, "200");
    await userEvent.click(
      screen.getByRole("button", { name: "Update filter" }),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Total.*200/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextQuery = onChange.mock.calls[0][0];
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
    expect(
      Lib.expressionParts(nextQuery, 0, Lib.filters(nextQuery, 0)[0]).operator,
    ).toBe("or");
    expect(
      Lib.displayInfo(nextQuery, 0, Lib.filters(nextQuery, 0)[0])
        .longDisplayName,
    ).toContain("200");
  });
});

describe("integrated OR filters with other editors", () => {
  it.each([false, true])(
    "keeps an unfinished draft when the summary changes (auto-apply: %s)",
    async (autoApply) => {
      const { onChange } = setup({ summarized: true, autoApply });
      await typeOpenParen();

      await userEvent.click(
        screen.getByRole("button", { name: "Change summary" }),
      );

      expect(getOpenParens()).toHaveLength(1);
      expect(screen.getByText(/Total.*100/)).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("keeps a valid draft for Apply when the summary changes", async () => {
    const { onChange } = setup({ summarized: true });
    await userEvent.click(screen.getByText("or"));

    await userEvent.click(
      screen.getByRole("button", { name: "Change summary" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextQuery = onChange.mock.calls[0][0];
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(2);
    expect(Lib.filters(nextQuery, 0)).toHaveLength(2);
  });

  it("resets the draft when another editor changes the same filters", async () => {
    setup({ summarized: true });
    await typeOpenParen();

    await userEvent.click(
      screen.getByRole("button", { name: "Replace filters" }),
    );

    // the new filters' own group, without the typed parenthesis
    expect(screen.getByText(/Quantity.*3/)).toBeInTheDocument();
    expect(getOpenParens()).toHaveLength(1);
    expect(
      screen.queryByText("Expected a filter at the end"),
    ).not.toBeInTheDocument();
  });
});

describe("integrated OR filters keyboard", () => {
  it("closes the list on the first Esc and discards the draft on the second", async () => {
    const { onChange } = setup({ summarized: true });
    await userEvent.click(screen.getByText("or"));
    expect(screen.getByText("and")).toBeInTheDocument();
    await userEvent.click(getRowFilterInput());
    expect(screen.getByTestId("filter-picker-dropdown")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(
      screen.queryByTestId("filter-picker-dropdown"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("and")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.getByText("or")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
    expect(getRowFilterInput()).not.toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies with ⌘/Ctrl+Enter even while the list is open", async () => {
    const { onChange } = setup({ summarized: true });
    await userEvent.click(screen.getByText("or"));
    await userEvent.click(getRowFilterInput());
    await userEvent.keyboard("Tot");

    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextQuery = onChange.mock.calls[0][0];
    expect(Lib.filters(nextQuery, 0)).toHaveLength(2);
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
  });

  it("keeps focus on Enter when the expression has an error", async () => {
    const { onChange } = setup({ summarized: true });
    await typeOpenParen();

    await userEvent.keyboard("{Enter}");

    expect(getRowFilterInput()).toHaveFocus();
    expect(getOpenParens()).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("integrated OR filters stats", () => {
  const getFieldRefPattern = (fieldId: number) =>
    new RegExp(`"field",\\{[^}]*\\},${fieldId}\\]`);

  it("counts a nested filter's stats over the filters it is AND-ed with", async () => {
    setupDatabaseEndpoints(createSampleDatabase());
    setupPrototypeSamplesEndpoint();
    fetchMock.post("path:/api/dataset", createMockDataset());
    // `([Total] > 100 AND [Quantity] > 3) OR [Tax] > 2`
    const query = withDnfExample(
      Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      0,
    );
    renderWithProviders(
      <IntegrationFilters query={query} onChange={jest.fn()} />,
      {
        storeInitialState: {
          settings: mockSettings({
            "prototype-data": {
              database_id: SAMPLE_DB_ID,
              fast_table_ids: [ORDERS_ID],
              slow_table_ids: [],
            },
          }),
        },
      },
    );

    await userEvent.click(screen.getByText(/Total.*100/));

    await waitFor(() =>
      expect(fetchMock.callHistory.calls("path:/api/dataset")).not.toHaveLength(
        0,
      ),
    );
    const bodies = await Promise.all(
      fetchMock.callHistory
        .calls("path:/api/dataset")
        .map(async (call): Promise<unknown> => call.request?.json()),
    );
    for (const body of bodies) {
      const json = JSON.stringify(body);
      expect(json).toMatch(getFieldRefPattern(ORDERS.QUANTITY));
      expect(json).not.toMatch(getFieldRefPattern(ORDERS.TAX));
      expect(json).not.toContain('"or"');
    }
  });
});

it.each([
  ["one level", withDnfExample, false],
  ["two levels", withNestedExample, true],
] as const)(
  "expands %s of parentheses only when needed and collapses on blur",
  async (_label, example, shouldExpand) => {
    setupDatabaseEndpoints(createSampleDatabase());
    setupPrototypeSamplesEndpoint();
    const query = example(
      Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      0,
    );
    renderWithProviders(
      <>
        <IntegrationFilters query={query} onChange={jest.fn()} />
        <button>Outside</button>
      </>,
    );
    expect(screen.queryAllByTestId("filter-expression-row-break")).toHaveLength(
      0,
    );
    await userEvent.click(
      screen.getByRole("textbox", { name: "Filter expression" }),
    );
    expect(
      screen.queryAllByTestId("filter-expression-row-break").length > 0,
    ).toBe(shouldExpand);
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryAllByTestId("filter-expression-row-break")).toHaveLength(
      0,
    );
  },
);
