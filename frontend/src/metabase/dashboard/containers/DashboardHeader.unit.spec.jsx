import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockDashboard } from "metabase-types/api/mocks";
import { setupBookmarksEndpoints } from "__support__/server-mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";
import { getDefaultTab } from "metabase/dashboard/actions";
import DashboardHeader from "./DashboardHeader";

const TEST_DASHBOARD = createMockDashboard();

const TEST_DASHBOARD_WITH_TABS = createMockDashboard({
  ordered_tabs: [
    getDefaultTab({ tabId: 1, dashId: 1, name: "Page 1" }),
    getDefaultTab({
      tabId: 2,
      dashId: 1,
      name: "Page 2",
    }),
  ],
});

const setup = async ({ dashboard = TEST_DASHBOARD }) => {
  setupBookmarksEndpoints([]);

  const dashboardHeaderProps = {
    dashboard,
    isEditable: true,
    isEditing: false,
    isFullscreen: false,
    isNavBarOpen: false,
    isNightMode: false,
    isAdditionalInfoVisible: false,
    refreshPeriod: 0,
    setRefreshElapsedHook: jest.fn(),
    addCardToDashboard: jest.fn(),
    addTextDashCardToDashboard: jest.fn(),
    addLinkDashCardToDashboard: jest.fn(),
    fetchDashboard: jest.fn(),
    saveDashboardAndCards: jest.fn(),
    setDashboardAttribute: jest.fn(),
    onEditingChange: jest.fn(),
    onRefreshPeriodChange: jest.fn(),
    onNightModeChange: jest.fn(),
    onFullscreenChange: jest.fn(),
    onSharingClick: jest.fn(),
    onChangeLocation: jest.fn(),
    toggleSidebar: jest.fn(),
    sidebar: {
      name: "",
      props: {},
    },
    location: {},
    setSidebar: jest.fn(),
    closeSidebar: jest.fn(),
    addActionToDashboard: jest.fn(),
    databases: {},
  };

  renderWithProviders(<DashboardHeader {...dashboardHeaderProps} />, {
    storeInitialState: {
      dashboard: createMockDashboardState({
        dashboardId: dashboard.id,
        dashboards: {
          [dashboard.id]: dashboard,
        },
      }),
    },
  });

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });
};

describe("DashboardHeader", () => {
  it("should display `Export as PDF` when there is a single dashboard tab", async () => {
    await setup({
      dashboard: TEST_DASHBOARD,
    });

    userEvent.click(screen.getByLabelText("dashboard-menu-button"));

    const exportPdfButton = within(
      screen.getByTestId("dashboard-export-pdf-button"),
    );
    expect(exportPdfButton.getByText("Export as PDF")).toBeInTheDocument();
  });

  it("should display `Export tab as PDF` when there are multiple dashboard tabs", async () => {
    await setup({
      dashboard: TEST_DASHBOARD_WITH_TABS,
    });

    userEvent.click(screen.getByLabelText("dashboard-menu-button"));

    const exportPdfButton = within(
      screen.getByTestId("dashboard-export-pdf-button"),
    );
    expect(exportPdfButton.getByText("Export tab as PDF")).toBeInTheDocument();
  });
});
