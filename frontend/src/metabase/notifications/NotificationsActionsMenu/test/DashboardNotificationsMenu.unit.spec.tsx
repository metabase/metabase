import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import {
  createMockCard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import {
  setupDashboardSharingMenu,
  waitForChannelsConfigLoaded,
} from "./setup";

describe("DashboardNotificationsMenu", () => {
  afterEach(() => {
    fetchMock.resetHistory();
  });

  it("should have a 'Subscriptions' tooltip by default", async () => {
    setupDashboardSharingMenu({
      isAdmin: true,
    });

    await waitForChannelsConfigLoaded();

    expect(
      screen.getByTestId("dashboard-subscription-menu-item"),
    ).toHaveAttribute("aria-label", "Subscriptions");
  });

  it("should not appear for archived dashboards", async () => {
    setupDashboardSharingMenu({
      isAdmin: true,
      dashboard: { archived: true },
    });

    expect(
      screen.queryByTestId("dashboard-subscription-menu-item"),
    ).not.toBeInTheDocument();
  });

  describe("admins", () => {
    it("should show the 'Subscriptions' menu item if email and slack are not setup", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isEmailSetup: false,
        isSlackSetup: false,
      });

      await waitForChannelsConfigLoaded();

      expect(screen.getByLabelText("Subscriptions")).toBeInTheDocument();
    });

    it("should show the 'Subscriptions' menu item if email and slack are setup", async () => {
      setupDashboardSharingMenu({
        isAdmin: true,
        isEmailSetup: true,
        isSlackSetup: true,
      });

      await waitForChannelsConfigLoaded();

      expect(screen.getByLabelText("Subscriptions")).toBeInTheDocument();
    });

    it("Should toggle the subscriptions sidebar on click", async () => {
      setupDashboardSharingMenu({ isAdmin: true });

      await userEvent.click(screen.getByLabelText("Subscriptions"));
      expect(screen.getByTestId("fake-sidebar")).toHaveTextContent(
        "Sidebar: sharing",
      );
    });

    it("should not show the subscriptions menu item if there are no data cards", async () => {
      setupDashboardSharingMenu({
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
        screen.queryByTestId("dashboard-subscription-menu-item"),
      ).not.toBeInTheDocument();
    });
  });

  describe("non-admins", () => {
    it("should show 'Subscriptions' option when email is set up", async () => {
      setupDashboardSharingMenu({
        isAdmin: false,
        isEmailSetup: true,
        isSlackSetup: false,
      });

      await waitForChannelsConfigLoaded();

      expect(screen.getByLabelText("Subscriptions")).toBeInTheDocument();
    });

    it("should show disabled 'Subscriptions' option when email is not set up", async () => {
      setupDashboardSharingMenu({
        isAdmin: false,
        isEmailSetup: false,
        isSlackSetup: true,
      });

      await waitForChannelsConfigLoaded();

      expect(
        screen.getByLabelText(
          "Can't send subscriptions. Ask your admin to set up email",
        ),
      ).toBeInTheDocument();
    });

    it("should not show the subscriptions menu item if there are no data cards", async () => {
      setupDashboardSharingMenu({
        isAdmin: false,
        dashboard: {
          dashcards: [
            createMockDashboardCard({
              card: createMockCard({ display: "heading" }),
            }),
          ],
        },
      });

      expect(
        screen.queryByTestId("dashboard-subscription-menu-item"),
      ).not.toBeInTheDocument();
    });
  });
});
