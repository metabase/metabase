import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { MetricEmptyState } from "./MetricEmptyState";

type SetupOpts = {
  isRunnable: boolean;
};

function setup({ isRunnable }: SetupOpts) {
  const runQuestionQuery = jest.fn();

  renderWithProviders(
    <MetricEmptyState
      isRunnable={isRunnable}
      runQuestionQuery={runQuestionQuery}
    />,
  );

  return { runQuestionQuery };
}

describe("MetricEmptyState", () => {
  it("should allow to run a valid metric query", async () => {
    const { runQuestionQuery } = setup({ isRunnable: true });
    await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
    expect(runQuestionQuery).toHaveBeenCalled();
  });

  it("should not allow to run an invalid metric query", () => {
    setup({ isRunnable: false });
    expect(
      screen.queryByRole("button", { name: "Visualize" }),
    ).not.toBeInTheDocument();
  });
});
