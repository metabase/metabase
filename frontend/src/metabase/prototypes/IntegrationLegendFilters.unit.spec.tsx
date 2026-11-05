import userEvent from "@testing-library/user-event";

import {
  setupDatabaseEndpoints,
  setupPrototypeSamplesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { IntegrationLegendFilters } from "./IntegrationLegendFilters";
import { withOrExample } from "./or-filters/harness/examples";

describe("integrated legend filters", () => {
  it("adds a measure filter after the summary and keeps row-level OR filters", async () => {
    setupDatabaseEndpoints(createSampleDatabase());
    setupPrototypeSamplesEndpoint();
    const rowsQuery = withOrExample(
      Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      0,
    );
    const query = Lib.aggregate(
      rowsQuery,
      0,
      Lib.expressionClause("count", []),
    );
    const onChange = jest.fn((nextQuery: Lib.Query) => nextQuery);
    renderWithProviders(
      <IntegrationLegendFilters query={query} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Count" }));
    await userEvent.click(
      screen.getByRole("textbox", { name: "Filter operator" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Greater than" }));
    await userEvent.type(
      await screen.findByPlaceholderText("Enter a number"),
      "10",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nextQuery = onChange.mock.calls[0][0];
    expect(Lib.stageCount(nextQuery)).toBe(2);
    expect(Lib.filters(nextQuery, 1)).toHaveLength(1);
    expect(Lib.aggregations(nextQuery, 0)).toHaveLength(1);
    expect(
      Lib.expressionParts(nextQuery, 0, Lib.filters(nextQuery, 0)[0]).operator,
    ).toBe("or");
  });
});
