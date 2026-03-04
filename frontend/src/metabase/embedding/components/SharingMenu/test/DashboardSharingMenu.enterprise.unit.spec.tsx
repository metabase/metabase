import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setupDashboardSharingMenu } from "./setup";

describe("DashboardSharingMenu > Enterprise", () => {
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
