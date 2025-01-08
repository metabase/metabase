import { screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { openMenu, setup } from "./setup";

describe("DashboardActionMenu", () => {
  it("should not allow embedding instance analytics dashboard", async () => {
    setup({
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
