import { screen } from "__support__/ui";

import { openMenu, setupDashboardSharingMenu } from "./setup";

describe("DashboardNotificationsMenu > Enterprise", () => {
  it('Should show the "Subscriptions" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
    await setupDashboardSharingMenu({
      canManageSubscriptions: true,
      isEmailSetup: true,
      isEnterprise: true,
      isAdmin: false,
    });
    await openMenu();
    expect(screen.getByText("Subscriptions")).toBeInTheDocument();
  });

  it('Should not show the "Subscriptions" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
    await setupDashboardSharingMenu({
      canManageSubscriptions: false,
      isEmailSetup: true,
      isEnterprise: true,
      isAdmin: false,
    });

    expect(
      screen.queryByTestId("notifications-menu-button"),
    ).not.toBeInTheDocument();
  });
});
