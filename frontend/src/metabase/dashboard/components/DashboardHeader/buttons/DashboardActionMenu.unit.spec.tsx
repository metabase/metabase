import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  createScenario,
  setupNotificationChannelsScenario,
} from "__support__/scenarios";
import { screen } from "__support__/ui";
import { getIsSharing } from "metabase/dashboard/selectors";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
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
  dashboard?: Partial<Dashboard>;
} = {}) => {
  const builder = createScenario()
    .withDashboard({ dashcards: [DASHCARD], ...dashboardOverrides })
    .withUser({
      is_superuser: isAdmin,
      ...(isEnterprise && {
        permissions: {
          can_access_subscription: canManageSubscriptions ?? false,
        } as any,
      }),
    })
    .withDashboardReduxState();

  if (isEnterprise) {
    builder.withEnterprise({
      plugins: ["application_permissions"],
      tokenFeatures: { advanced_permissions: true },
    });
  }

  setupNotificationChannelsScenario({
    email: hasEmailSetup,
    slack: hasSlackSetup,
  });

  const { dashboard, render } = builder.build();

  const { store } = render(
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
          <DashboardActionMenu
            canResetFilters={false}
            onResetFilters={jest.fn()}
            canEdit={false}
            openSettingsSidebar={jest.fn()}
          />
        </MockDashboardContext>
      )}
    />,
    { withRouter: true },
  );

  return { store };
};

const openMenu = () => {
  return userEvent.click(
    screen.getByRole("button", { name: /Move, trash, and more/ }),
  );
};

describe("DashboardActionMenu", () => {
  describe("dashboard subscriptions", () => {
    describe("admins", () => {
      it("should show the 'Subscriptions' menu item if email and slack are not setup", async () => {
        setup({ isAdmin: true, hasEmailSetup: false, hasSlackSetup: false });
        await openMenu();
        expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      });

      it("should show the 'Subscriptions' menu item if email and slack are setup", async () => {
        setup({ isAdmin: true, hasEmailSetup: true, hasSlackSetup: true });
        await openMenu();
        expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      });

      it("should toggle the subscriptions sidebar on click", async () => {
        const { store } = setup({ isAdmin: true });
        expect(getIsSharing(store.getState())).toBe(false);
        await openMenu();
        await userEvent.click(await screen.findByText("Subscriptions"));
        expect(getIsSharing(store.getState())).toBe(true);
        await openMenu();
        await userEvent.click(await screen.findByText("Subscriptions"));
        expect(getIsSharing(store.getState())).toBe(false);
      });

      it("should not show the subscriptions menu item if there are no data cards", async () => {
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
        await openMenu();
        expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
      });
    });

    describe("non-admins", () => {
      it("should show 'Subscriptions' option when email is set up, but slack is not setup", async () => {
        setup({ isAdmin: false, hasEmailSetup: true, hasSlackSetup: false });
        await openMenu();
        expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      });

      it("should show 'Subscriptions' option when email is not set up, but slack is setup", async () => {
        setup({ isAdmin: false, hasEmailSetup: false, hasSlackSetup: true });
        await openMenu();
        expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      });

      it("should not show the subscriptions menu item if there are no data cards", async () => {
        setup({
          isAdmin: false,
          dashboard: {
            dashcards: [
              createMockDashboardCard({
                card: createMockCard({ display: "heading" }),
              }),
            ],
          },
        });
        await openMenu();
        expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
      });
    });

    describe("enterprise", () => {
      it('should show the "Subscriptions" menu item to non-admins with subscription permissions', async () => {
        setup({
          canManageSubscriptions: true,
          hasEmailSetup: true,
          isEnterprise: true,
          isAdmin: false,
        });
        await openMenu();
        expect(await screen.findByText("Subscriptions")).toBeInTheDocument();
      });

      it('should not show the "Subscriptions" menu item to non-admins without subscription permissions', async () => {
        setup({
          canManageSubscriptions: false,
          hasEmailSetup: true,
          isEnterprise: true,
          isAdmin: false,
        });
        await openMenu();
        expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
      });
    });
  });
});
