import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";

import { MetricEmptyState } from "./MetricEmptyState";

type SetupOpts = {
  query: Lib.Query;
};

function setup({ query }: SetupOpts) {
  const runQuestionQuery = jest.fn();

  renderWithProviders(
    <MetricEmptyState query={query} runQuestionQuery={runQuestionQuery} />,
  );

  return { runQuestionQuery };
}

describe("MetricEmptyState", () => {
  it("should allow to run a valid metric query", async () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });
    const { runQuestionQuery } = setup({ query });
    await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
    expect(runQuestionQuery).toHaveBeenCalled();
  });

  it("should not allow to run an invalid metric query", () => {
    const query = createQuery();
    setup({ query });
    expect(
      screen.queryByRole("button", { name: "Visualize" }),
    ).not.toBeInTheDocument();
  });
});
