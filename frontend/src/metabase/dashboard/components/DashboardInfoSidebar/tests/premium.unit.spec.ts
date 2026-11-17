import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardTab,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts: SetupOpts) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: true,
        cache_granular_controls: true,
        serialization: true,
        audit_app: true,
      }),
    }),
    enterprisePlugins: ["collections"],
  });
};

describe("DashboardInfoSidebar > enterprise", () => {
  describe("entity id display", () => {
    it("should show entity ids in the footer with the serialization feature", async () => {
      const dashboard = createMockDashboard({
        // Unjustified type cast. FIXME
        entity_id: "jenny8675309" as Dashboard["entity_id"],
      });
      await setupEnterprise({ dashboard });

      await userEvent.click(
        screen.getByRole("button", { name: "Entity ID info" }),
      );

      expect(await screen.findByText("This dashboard")).toBeInTheDocument();
      expect(screen.getByText("jenny8675309")).toBeInTheDocument();
    });

    it("should list the dashboard's tabs with their entity ids", async () => {
      const tabs = [
        createMockDashboardTab({
          id: 1,
          name: "Tab 1",
          entity_id: createMockEntityId("tab-1-entity-id"),
        }),
        createMockDashboardTab({
          id: 2,
          name: "Tab 2",
          entity_id: createMockEntityId("tab-2-entity-id"),
        }),
      ];
      await setupEnterprise({ dashboard: createMockDashboard({ tabs }) });

      await userEvent.click(
        screen.getByRole("button", { name: "Entity ID info" }),
      );

      const labels = await screen.findAllByRole("term");
      expect(labels.map((label) => label.textContent)).toEqual([
        "This dashboard",
        "Tab 1",
        "Tab 2",
      ]);
      tabs.forEach((tab) => {
        expect(screen.getByText(String(tab.entity_id))).toBeInTheDocument();
      });
    });
  });
});
