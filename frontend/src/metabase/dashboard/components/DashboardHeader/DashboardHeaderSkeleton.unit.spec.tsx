import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { StoreDashboardTab } from "metabase/redux/store";
import { createMockDashboardTab } from "metabase-types/api/mocks";

import { DashboardHeaderSkeleton } from "./DashboardHeaderSkeleton";

type SetupOpts = {
  tabs?: StoreDashboardTab[];
  titled?: boolean;
  isCached?: boolean;
};

function setup({ tabs = [], titled = true, isCached = true }: SetupOpts = {}) {
  renderWithProviders(
    <DashboardHeaderSkeleton dashboardId={1} titled={titled} />,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({
          dashboards: isCached
            ? { 1: createMockStoreDashboard({ id: 1, tabs }) }
            : {},
        }),
      },
    },
  );
}

describe("DashboardHeaderSkeleton", () => {
  it("draws the title and action buttons as a busy region", () => {
    setup();

    expect(screen.getByTestId("dashboard-header-skeleton")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByTestId("dashboard-header-skeleton-title"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("dashboard-header-skeleton-actions").childElementCount,
    ).toBe(6);
  });

  it("leaves out the title where the dashboard isn't titled", () => {
    setup({ titled: false });

    expect(
      screen.queryByTestId("dashboard-header-skeleton-title"),
    ).not.toBeInTheDocument();
  });

  it("draws no tab row on a fresh page load", () => {
    setup({ isCached: false });

    expect(
      screen.queryByTestId("dashboard-header-skeleton-tabs"),
    ).not.toBeInTheDocument();
  });

  it("draws no tab row for a dashboard with a single tab", () => {
    setup({ tabs: [createMockDashboardTab({ id: 1 })] });

    expect(
      screen.queryByTestId("dashboard-header-skeleton-tabs"),
    ).not.toBeInTheDocument();
  });

  it("draws one placeholder per tab, skipping removed tabs", () => {
    setup({
      tabs: [
        createMockDashboardTab({ id: 1 }),
        createMockDashboardTab({ id: 2 }),
        { ...createMockDashboardTab({ id: 3 }), isRemoved: true },
        createMockDashboardTab({ id: 4 }),
      ],
    });

    expect(
      screen.getByTestId("dashboard-header-skeleton-tabs").childElementCount,
    ).toBe(3);
  });
});
