import { renderWithProviders, screen } from "__support__/ui";
import type { StoreDashcard } from "metabase/redux/store";
import { createMockDashboardCard } from "metabase-types/api/mocks";

import { DashboardSkeleton } from "./DashboardSkeleton";

describe("DashboardSkeleton", () => {
  it("renders the dashboard header chrome and card grid without a spinner", () => {
    renderWithProviders(<DashboardSkeleton />);

    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();

    // Six action-icon placeholders and two tab placeholders.
    expect(
      screen.getByTestId("dashboard-skeleton-actions").childElementCount,
    ).toBe(6);
    expect(
      screen.getByTestId("dashboard-skeleton-tabs").childElementCount,
    ).toBe(2);

    // The card layout skeleton is rendered, and never a loading spinner.
    expect(screen.getByTestId("dashboard-grid-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    // No filters by default.
    expect(
      screen.queryByTestId("dashboard-skeleton-filters"),
    ).not.toBeInTheDocument();
  });

  it("renders one filter skeleton per dashboard filter widget", () => {
    renderWithProviders(<DashboardSkeleton filterCount={3} />);

    expect(
      screen.getByTestId("dashboard-skeleton-filters").childElementCount,
    ).toBe(3);
  });

  it("draws one skeleton card per cached dashcard", () => {
    const cards: StoreDashcard[] = [
      createMockDashboardCard({ id: 1, col: 0, row: 0, size_x: 12, size_y: 6 }),
      createMockDashboardCard({
        id: 2,
        col: 12,
        row: 0,
        size_x: 12,
        size_y: 6,
      }),
    ];

    renderWithProviders(<DashboardSkeleton cards={cards} />);

    const grid = screen.getByTestId(
      "dashboard-grid-skeleton",
    ).firstElementChild;
    expect(grid?.childElementCount).toBe(cards.length);
  });
});
