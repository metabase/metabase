import userEvent from "@testing-library/user-event";
import { getDefaultTab } from "metabase/dashboard/actions";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";
import { Dashboard } from "metabase-types/api";
import { setupEnterpriseTest } from "__support__/enterprise";
import DashboardHeader from "./DashboardHeader";

const TEST_DASHBOARD = createMockDashboard();

const TEST_DASHBOARD_WITH_TABS = createMockDashboard({
  id: 2,
  ordered_tabs: [
    getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" }),
    getDefaultTab({
      tabId: 2,
      dashId: 1,
      name: "Tab 2",
    }),
  ],
});

const ISNTANCE_ANALYTICS_DASHBOARD = createMockDashboard({
  id: 3,
  collection_id: 10,
});

const INSTANCE_ANALYTICS_COLLECTION = createMockCollection({
  name: "Custom Reports",
  id: 10,
  type: "instance-analytics",
});

const setup = async ({ dashboard }: { dashboard: Dashboard }) => {
  setupCollectionsEndpoints({ collections: [] });
  setupCollectionByIdEndpoint({ collections: [INSTANCE_ANALYTICS_COLLECTION] });
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
    updateDashboardAndCards: jest.fn(),
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
    location: {
      query: {},
    },
    setSidebar: jest.fn(),
    closeSidebar: jest.fn(),
    addActionToDashboard: jest.fn(),
    databases: {},
    params: { tabSlug: undefined },
  };

  renderWithProviders(<DashboardHeader {...dashboardHeaderProps} />);

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
};

describe("dashboard header", () => {
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

  describe("EE", () => {
    it("should render the correct buttons for instance analytics dashboard", async () => {
      setupEnterpriseTest();
      await setup({
        dashboard: ISNTANCE_ANALYTICS_DASHBOARD,
      });
      expect(screen.getByText("Make a copy")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /beaker/i })).toBeInTheDocument();

      //Other buttons
      expect(
        screen.getByRole("button", { name: /bookmark/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /info/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /fullscreen/i }),
      ).toBeInTheDocument();
    });
  });
});
