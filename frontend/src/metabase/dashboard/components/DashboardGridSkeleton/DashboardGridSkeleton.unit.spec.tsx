import { renderWithProviders, screen } from "__support__/ui";
import type { StoreDashcard } from "metabase/redux/store";
import {
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardGridSkeleton } from "./DashboardGridSkeleton";

const getGrid = () =>
  screen.getByTestId("dashboard-grid-skeleton").firstElementChild;

describe("DashboardGridSkeleton", () => {
  it("renders a generic placeholder layout when no cached layout is available", () => {
    renderWithProviders(<DashboardGridSkeleton />);

    expect(screen.getByTestId("dashboard-grid-skeleton")).toBeInTheDocument();
    expect(getGrid()?.childElementCount).toBeGreaterThan(0);

    // A loading spinner is never rendered.
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("renders one skeleton card per cached dashcard", () => {
    const cards: StoreDashcard[] = [
      createMockDashboardCard({ id: 1, col: 0, row: 0, size_x: 12, size_y: 6 }),
      createMockDashboardCard({
        id: 2,
        col: 12,
        row: 0,
        size_x: 12,
        size_y: 6,
      }),
      createMockDashboardCard({ id: 3, col: 0, row: 6, size_x: 24, size_y: 4 }),
    ];

    renderWithProviders(<DashboardGridSkeleton cards={cards} />);

    expect(getGrid()?.childElementCount).toBe(cards.length);
  });

  it("renders one line skeleton per line of a heading or text card", () => {
    const cards: StoreDashcard[] = [
      createMockHeadingDashboardCard({ id: 1, text: "One heading line" }),
      createMockTextDashboardCard({
        id: 2,
        text: "Line one\nLine two\nLine three",
      }),
    ];

    renderWithProviders(<DashboardGridSkeleton cards={cards} />);

    const textSkeletons = screen.getAllByTestId("dashboard-skeleton-text");
    expect(textSkeletons).toHaveLength(2);
    expect(textSkeletons[0].childElementCount).toBe(1);
    expect(textSkeletons[1].childElementCount).toBe(3);
  });
});
