import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockCard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { openMenu, setupDashboardSharingMenu } from "./setup";

describe("DashboardNotificationsMenu", () => {
  it("should have a 'Notifications' tooltip by default", () => {
    setupDashboardSharingMenu({
      isAdmin: true,
    });
    expect(screen.getByTestId("notifications-menu-button")).toHaveAttribute(
      "aria-label",
      "Notifications",
    );
  });

  it("should not appear for archived dashboards", async () => {
    setupDashboardSharingMenu({
      isAdmin: true,
      dashboard: { archived: true },
    });

    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
  });

  describe("dashboard subscriptions", () => {
    describe("admins", () => {
      it("should show the 'Subscriptions' menu item if email and slack are not setup", async () => {
        setupDashboardSharingMenu({
          isAdmin: true,
          isEmailSetup: false,
          isSlackSetup: false,
        });
        await openMenu();
        expect(screen.getByText("Subscriptions")).toBeInTheDocument();
      });

      it("should show the 'Subscriptions' menu item if email and slack are setup", async () => {
        setupDashboardSharingMenu({
          isAdmin: true,
          isEmailSetup: true,
          isSlackSetup: true,
        });
        await openMenu();
        expect(screen.getByText("Subscriptions")).toBeInTheDocument();
      });

      it("Should toggle the subscriptions sidebar on click", async () => {
        setupDashboardSharingMenu({ isAdmin: true });
        await openMenu();
        await userEvent.click(screen.getByText("Subscriptions"));
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
          screen.queryByTestId("notifications-menu-button"),
        ).not.toBeInTheDocument();
      });
    });

    describe("non-admins", () => {
      it("should show 'subscriptions' option when email is set up", async () => {
        setupDashboardSharingMenu({
          isAdmin: false,
          isEmailSetup: true,
          isSlackSetup: false,
        });
        await openMenu();
        expect(screen.getByText("Subscriptions")).toBeInTheDocument();
      });

      it("should show disabled 'subscriptions' option when email is not set up", async () => {
        setupDashboardSharingMenu({
          isAdmin: false,
          isEmailSetup: false,
          isSlackSetup: true,
        });
        await openMenu();
        expect(
          await screen.findByText("Can't send subscriptions"),
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
          screen.queryByTestId("notifications-menu-button"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
