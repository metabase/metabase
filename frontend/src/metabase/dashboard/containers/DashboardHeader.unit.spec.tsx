import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import {
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";
import { setupBookmarksEndpoints } from "__support__/server-mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";
import { getDefaultTab } from "metabase/dashboard/actions";
import DashboardHeader from "./DashboardHeader";

console.warn = jest.fn();
console.error = jest.fn();

const DASHCARD = createMockDashboardCard();

const TEST_DASHBOARD = createMockDashboard({
  dashcards: [DASHCARD],
});

const TEST_DASHBOARD_WITH_TABS = createMockDashboard({
  tabs: [
    getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" }),
    getDefaultTab({
      tabId: 2,
      dashId: 1,
      name: "Tab 2",
    }),
  ],
});

const setup = async ({
  dashboard = TEST_DASHBOARD,
  isAdmin = false,
  email = false,
  slack = false,
}) => {
  setupBookmarksEndpoints([]);

  const channelData: {
    channels: {
      email?: any;
      slack?: any;
    };
  } = { channels: {} };

  if (email) {
    channelData.channels.email = {
      type: "email",
      name: "Email",
      allows_recipients: true,
      recipients: ["user", "email"],
      schedules: ["hourly"],
      configured: true,
    };
  }

  if (slack) {
    channelData.channels.slack = {
      type: "slack",
      name: "Slack",
      allows_recipients: false,
      schedules: ["hourly"],
      configured: true,
      fields: [
        {
          name: "channel",
          type: "select",
          displayName: "Post to",
          options: ["#general", "#random", "#alerts"],
          required: true,
        },
      ],
    };
  }

  fetchMock.get("path:/api/pulse/form_input", channelData);

  const dashboardHeaderProps = {
    isAdmin,
    dashboard,
    canManageSubscriptions: true,
    isEditing: false,
    isFullscreen: false,
    isNavBarOpen: false,
    isNightMode: false,
    isAdditionalInfoVisible: false,
    refreshPeriod: 0,
    addMarkdownDashCardToDashboard: jest.fn(),
    addHeadingDashCardToDashboard: jest.fn(),
    setRefreshElapsedHook: jest.fn(),
    addCardToDashboard: jest.fn(),
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

  renderWithProviders(<DashboardHeader {...dashboardHeaderProps} />, {
    storeInitialState: {
      dashboard: createMockDashboardState({
        dashboardId: dashboard.id,
        dashboards: {
          [dashboard.id]: {
            ...dashboard,
            dashcards: dashboard.dashcards.map(c => c.id),
          },
        },
        dashcards: {
          [DASHCARD.id]: {
            ...DASHCARD,
            isDirty: false,
            isRemoved: false,
          },
        },
      }),
    },
  });

  await waitForLoaderToBeRemoved();
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

  it("should not show subscriptions button for non-admin users - when email and slack are not configured", async () => {
    await setup({
      isAdmin: false,
      email: false,
      slack: false,
    });

    expect(screen.queryByLabelText("subscriptions")).not.toBeInTheDocument();
  });

  it("should show subscriptions button for admins - even when email and slack are not configured", async () => {
    await setup({
      isAdmin: true,
      email: false,
      slack: false,
    });

    expect(screen.getByLabelText("subscriptions")).toBeInTheDocument();
  });
});
