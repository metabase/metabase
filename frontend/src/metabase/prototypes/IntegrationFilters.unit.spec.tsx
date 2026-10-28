import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  setupDatabaseEndpoints,
  setupPrototypeSamplesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  FilterAutoApplyContext,
  type FilterAutoApplyContextValue,
} from "metabase/querying/filters/components/FilterPicker/FilterAutoApplyContext";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { IntegrationFilters } from "./IntegrationFilters";
import { withOrExample } from "./or-filters/harness/examples";

interface SetupOpts {
  summarized?: boolean;
  autoApply?: boolean;
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
    </FilterAutoApplyContext.Provider>
  );
}

function setup({ summarized = false, autoApply = false }: SetupOpts = {}) {
  setupDatabaseEndpoints(createSampleDatabase());
  setupPrototypeSamplesEndpoint();
  let query = withOrExample(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    0,
  );
  if (summarized) {
    query = Lib.aggregate(query, 0, Lib.expressionClause("count", []));
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
  it("keeps summary-output filters in a separate stage", () => {
    const { onChange } = setup({ summarized: true });

    expect(screen.getByText("Stage 1")).toBeInTheDocument();
    expect(screen.getByText("Stage 2")).toBeInTheDocument();
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
