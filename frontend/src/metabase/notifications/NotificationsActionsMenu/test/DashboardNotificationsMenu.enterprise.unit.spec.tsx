import { screen } from "__support__/ui";

import {
  setupDashboardSharingMenu,
  waitForChannelsConfigLoaded,
} from "./setup";

describe("DashboardNotificationsMenu > Enterprise", () => {
  it('Should show the "Subscriptions" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
    await setupDashboardSharingMenu({
      canManageSubscriptions: true,
      isEmailSetup: true,
      isEnterprise: true,
      isAdmin: false,
    });

    await waitForChannelsConfigLoaded();

    expect(
      screen.getByTestId("dashboard-subscription-menu-item"),
    ).toBeInTheDocument();
  });

  it('Should not show the "Subscriptions" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
    await setupDashboardSharingMenu({
      canManageSubscriptions: false,
      isEmailSetup: true,
      isEnterprise: true,
      isAdmin: false,
    });

    expect(
      screen.queryByTestId("dashboard-subscription-menu-item"),
    ).not.toBeInTheDocument();
  });
});
