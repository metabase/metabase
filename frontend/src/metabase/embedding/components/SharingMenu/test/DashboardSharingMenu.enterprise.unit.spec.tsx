import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setupDashboardSharingMenu } from "./setup";

describe("DashboardSharingMenu > Enterprise", () => {
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
    await openMenu();
    expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
  });

  it("should not allow embedding instance analytics dashboard", async () => {
    setupDashboardSharingMenu({
      isAdmin: true,
      isPublicSharingEnabled: true,
      isEmbeddingEnabled: true,
      isEnterprise: true,
      dashboard: {
        name: "analysis",
        collection: createMockCollection({
          id: 198,
          name: "Analytics",
          type: "instance-analytics",
        }),
      },
    });
    await openMenu();
    expect(screen.queryByText("Embed")).not.toBeInTheDocument();
    expect(screen.queryByText("Create Public Link")).not.toBeInTheDocument();
  });
});
