import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { StoreDashboardTab, StoreDashcard } from "metabase/redux/store";
import {
  createMockDashboardCard,
  createMockDashboardTab,
  createMockHeadingDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardGridSkeleton } from "./DashboardGridSkeleton";

type SetupOpts = {
  dashcards?: StoreDashcard[];
  tabs?: StoreDashboardTab[];
  isCached?: boolean;
};

function setup({ dashcards = [], tabs = [], isCached = true }: SetupOpts = {}) {
  renderWithProviders(<DashboardGridSkeleton dashboardId={1} />, {
    storeInitialState: {
      dashboard: createMockDashboardState({
        dashboards: isCached
          ? {
              1: createMockStoreDashboard({
                id: 1,
                dashcards: dashcards.map((dc) => dc.id),
                tabs,
              }),
            }
          : {},
        dashcards: Object.fromEntries(dashcards.map((dc) => [dc.id, dc])),
      }),
    },
  });
}

const getSkeletonCards = () =>
  screen.getByTestId("dashboard-grid-skeleton-cards").children;

describe("DashboardGridSkeleton", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("tells assistive technology the dashboard is loading, without a spinner", () => {
    setup();

    const skeleton = screen.getByTestId("dashboard-grid-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(within(skeleton).getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("draws no cards until the dashboard's layout is known", () => {
    setup({ isCached: false });

    expect(screen.getByTestId("dashboard-grid-skeleton")).toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-grid-skeleton-cards"),
    ).not.toBeInTheDocument();
  });

  it("draws exactly the cached dashboard's cards", () => {
    setup({
      dashcards: [
        createMockDashboardCard({ id: 1, col: 0, row: 0, size_x: 12 }),
        createMockDashboardCard({ id: 2, col: 12, row: 0, size_x: 12 }),
      ],
    });

    expect(getSkeletonCards()).toHaveLength(2);
  });

  it("draws the cards of the tab the URL lands on", () => {
    window.history.replaceState({}, "", "/dashboard/1?tab=200");
    setup({
      tabs: [
        createMockDashboardTab({ id: 100 }),
        createMockDashboardTab({ id: 200 }),
      ],
      dashcards: [
        createMockDashboardCard({ id: 1, dashboard_tab_id: 100 }),
        createMockDashboardCard({ id: 2, dashboard_tab_id: 200 }),
        createMockDashboardCard({ id: 3, dashboard_tab_id: 200 }),
      ],
    });

    expect(getSkeletonCards()).toHaveLength(2);
  });

  it("lands on the first tab that hasn't been removed", () => {
    setup({
      tabs: [
        { ...createMockDashboardTab({ id: 100 }), isRemoved: true },
        createMockDashboardTab({ id: 200 }),
      ],
      dashcards: [
        createMockDashboardCard({ id: 1, dashboard_tab_id: 100 }),
        createMockDashboardCard({ id: 2, dashboard_tab_id: 200 }),
        createMockDashboardCard({ id: 3, dashboard_tab_id: 200 }),
      ],
    });

    expect(getSkeletonCards()).toHaveLength(2);
  });

  it("renders one line skeleton per line of a heading or text card", () => {
    setup({
      dashcards: [
        createMockHeadingDashboardCard({ id: 1, text: "One heading line" }),
        createMockTextDashboardCard({
          id: 2,
          text: "Line one\nLine two\nLine three",
        }),
      ],
    });

    const textSkeletons = screen.getAllByTestId("dashboard-skeleton-text");
    expect(textSkeletons).toHaveLength(2);
    expect(textSkeletons[0].childElementCount).toBe(1);
    expect(textSkeletons[1].childElementCount).toBe(3);
  });
});
