import { screen } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts: SetupOpts) => {
  return setup({
    ...opts,
  });
};

describe("DashboardInfoSidebar > enterprise", () => {
  describe("entity id display", () => {
    it("should not show entity ids without serialization feature", async () => {
      const dashboard = createMockDashboard({
        entity_id: "jenny8675309" as Dashboard["entity_id"],
      });
      await setupEnterprise({ dashboard });

      expect(screen.queryByText("Entity ID")).not.toBeInTheDocument();
      expect(screen.queryByText("jenny8675309")).not.toBeInTheDocument();
    });
  });
});
