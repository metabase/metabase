import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { DashboardActionMenu } from "./DashboardActionMenu";

const DASHCARD = createMockDashboardCard({
  card: createMockCard({ display: "pie" }),
});

const setup = ({
  isAdmin = false,
  hasEmailSetup = false,
  hasSlackSetup = false,
  canManageSubscriptions,
  isEnterprise = false,
  dashboard: dashboardOverrides = {},
}: {
  isAdmin?: boolean;
  hasEmailSetup?: boolean;
  hasSlackSetup?: boolean;
  canManageSubscriptions?: boolean;
  isEnterprise?: boolean;
  dashboard?: Partial<ReturnType<typeof createMockDashboard>>;
} = {}) => {
  const dashboard = createMockDashboard({
    dashcards: [DASHCARD],
    ...dashboardOverrides,
  });

  if (isEnterprise) {
    setupEnterpriseOnlyPlugin("application_permissions");
  }

  const currentUser = createMockUser({
    is_superuser: isAdmin,
  });

  setupNotificationChannelsEndpoints({
    email: { configured: hasEmailSetup },
    slack: { configured: hasSlackSetup },
  });

  const { store } = renderWithProviders(
    <Route
      path="*"
      component={() => (
        <MockDashboardContext
          dashboardId={dashboard.id}
          dashboard={dashboard}
          isFullscreen={false}
          onFullscreenChange={jest.fn()}
          refreshPeriod={null}
          onRefreshPeriodChange={jest.fn()}
          setRefreshElapsedHook={jest.fn()}
          parameterQueryParams={{}}
        >
          <DashboardActionMenu
            canResetFilters={false}
            onResetFilters={jest.fn()}
            canEdit={false}
            openSettingsSidebar={jest.fn()}
          />
        </MockDashboardContext>
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: isEnterprise
          ? {
              ...currentUser,
              permissions: {
                can_access_subscription: canManageSubscriptions ?? false,
              },
            }
          : currentUser,
        ...(isEnterprise && {
          settings: mockSettings(
            createMockSettings({
              "token-features": createMockTokenFeatures({
                advanced_permissions: true,
              }),
            }),
          ),
        }),
        dashboard: createMockDashboardState({
          dashboardId: dashboard.id,
          dashboards: {
            [dashboard.id]: {
              ...dashboard,
              dashcards: dashboard.dashcards.map((c) => c.id),
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
    },
  );

  return { store };
};

const openMenu = () => {
  return userEvent.click(
    screen.getByRole("button", { name: /Move, trash, and more/ }),
  );
};

describe("DashboardActionMenu", () => {
  it("should show the 'Enter fullscreen' and 'Auto-refresh' items", async () => {
    setup({ isAdmin: true });
    await openMenu();

    expect(await screen.findByText("Enter fullscreen")).toBeInTheDocument();
    expect(
      screen.getByTestId("dashboard-auto-refresh-menu-item"),
    ).toBeInTheDocument();
    expect(screen.getByText("Auto-refresh")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
  });

  it("should drill into the auto-refresh options when the trigger is clicked", async () => {
    setup({ isAdmin: true });
    await openMenu();

    await userEvent.click(
      screen.getByTestId("dashboard-auto-refresh-menu-item"),
    );

    // The main menu items are replaced by the auto-refresh options
    expect(screen.getByText("Auto Refresh")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("1 minute")).toBeInTheDocument();
    expect(screen.getByText("60 minutes")).toBeInTheDocument();
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(screen.queryByText("Enter fullscreen")).not.toBeInTheDocument();
  });
});
