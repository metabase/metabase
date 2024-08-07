import { screen } from "__support__/ui";

import { setupDashboardSharingMenu, openMenu } from "./setup";

describe("DashboardSharingMenu > Enterprise", () => {
  it('Should show the "Subscriptions" menu item to non-admins if the user has subscriptions/alerts permissions', async () => {
    await setupDashboardSharingMenu({
      canManageSubscriptions: true,
      isEnterprise: true,
      isAdmin: false,
    });
    await openMenu();
    expect(screen.getByText("Subscriptions")).toBeInTheDocument();
  });

  it('Should not show the "Subscriptions" menu item to non-admins if the user lacks subscriptions/alerts permissions', async () => {
    await setupDashboardSharingMenu({
      canManageSubscriptions: false,
      isEnterprise: true,
      isAdmin: false,
    });
    await openMenu();
    expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
  });
});
