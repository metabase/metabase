import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { getIsSharing } from "metabase/dashboard/selectors";
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

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";

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
          parameterQueryParams={{}}
        >
          <DashboardSubscriptionsButton />
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

const getButton = () => screen.getByTestId("dashboard-subscriptions-button");

describe("DashboardSubscriptionsButton", () => {
  describe("admins", () => {
    it("should show an enabled button if email and slack are not setup", async () => {
      setup({ isAdmin: true, hasEmailSetup: false, hasSlackSetup: false });

      const button = await screen.findByTestId(
        "dashboard-subscriptions-button",
      );
      expect(button).toBeEnabled();

      await userEvent.hover(button);
      expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
    });

    it("should show an enabled button if email and slack are setup", async () => {
      setup({ isAdmin: true, hasEmailSetup: true, hasSlackSetup: true });
      expect(
        await screen.findByTestId("dashboard-subscriptions-button"),
      ).toBeEnabled();
    });

    it("should toggle the subscriptions sidebar on click", async () => {
      const { store } = setup({ isAdmin: true });
      expect(getIsSharing(store.getState())).toBe(false);

      await userEvent.click(getButton());
      expect(getIsSharing(store.getState())).toBe(true);

      await userEvent.click(getButton());
      expect(getIsSharing(store.getState())).toBe(false);
    });

    it("should not render if there are no data cards", () => {
      setup({
        isAdmin: true,
        dashboard: {
          dashcards: [
            createMockDashboardCard({
              card: createMockCard({ display: "text" }),
            }),
          ],
        },
      });
      expect(
        screen.queryByTestId("dashboard-subscriptions-button"),
      ).not.toBeInTheDocument();
    });
  });

  describe("non-admins", () => {
    it("should show an enabled button when email is set up", async () => {
      setup({ isAdmin: false, hasEmailSetup: true, hasSlackSetup: false });
      await waitFor(() => expect(getButton()).toBeEnabled());
    });

    it("should show an enabled button when slack is set up", async () => {
      setup({ isAdmin: false, hasEmailSetup: false, hasSlackSetup: true });
      await waitFor(() => expect(getButton()).toBeEnabled());
    });

    it("should show a disabled button when no channel is set up", async () => {
      setup({ isAdmin: false, hasEmailSetup: false, hasSlackSetup: false });

      const button = await screen.findByTestId(
        "dashboard-subscriptions-button",
      );
      expect(button).toBeDisabled();

      await userEvent.hover(button);
      expect(
        await screen.findByText("Can't send subscriptions"),
      ).toBeInTheDocument();
    });

    it("should not render if there are no data cards", () => {
      setup({
        isAdmin: false,
        hasEmailSetup: true,
        dashboard: {
          dashcards: [
            createMockDashboardCard({
              card: createMockCard({ display: "heading" }),
            }),
          ],
        },
      });
      expect(
        screen.queryByTestId("dashboard-subscriptions-button"),
      ).not.toBeInTheDocument();
    });
  });

  describe("enterprise", () => {
    it("should render for non-admins with subscription permissions", async () => {
      setup({
        canManageSubscriptions: true,
        hasEmailSetup: true,
        isEnterprise: true,
        isAdmin: false,
      });
      expect(
        await screen.findByTestId("dashboard-subscriptions-button"),
      ).toBeInTheDocument();
    });

    it("should not render for non-admins without subscription permissions", () => {
      setup({
        canManageSubscriptions: false,
        hasEmailSetup: true,
        isEnterprise: true,
        isAdmin: false,
      });
      expect(
        screen.queryByTestId("dashboard-subscriptions-button"),
      ).not.toBeInTheDocument();
    });
  });
});
