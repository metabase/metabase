import { renderWithProviders, screen } from "__support__/ui";

import { ExplorationChartAreaSkeleton } from "./ExplorationChartAreaSkeleton";

describe("ExplorationChartAreaSkeleton", () => {
  it("renders the chart-area skeleton", () => {
    renderWithProviders(<ExplorationChartAreaSkeleton />);

    expect(
      screen.getByTestId("exploration-chart-area-skeleton"),
    ).toBeInTheDocument();
  });
});
