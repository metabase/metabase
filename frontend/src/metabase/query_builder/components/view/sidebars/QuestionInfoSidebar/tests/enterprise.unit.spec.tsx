import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (opts: SetupOpts) => {
  return setup({
    ...opts,
  });
};

describe("QuestionInfoSidebar > enterprise", () => {
  describe("official badge", () => {
    it("should not show official badge without remote sync feature", async () => {
      const card = createMockCard({
        collection: createMockCollection({ is_remote_synced: true }),
      });
      await setupEnterprise({ card });
      expect(screen.queryByTestId("official-badge")).not.toBeInTheDocument();
    });
  });

  describe("entity id display", () => {
    it("should not show entity ids without serialization feature", async () => {
      const card = createMockCard({
        // Unjustified type cast. FIXME
        entity_id: "jenny8675309" as Card["entity_id"],
      });
      await setupEnterprise({ card });

      expect(screen.queryByText("Entity ID info")).not.toBeInTheDocument();
      expect(screen.queryByText("jenny8675309")).not.toBeInTheDocument();
    });
  });

  describe("insights action", () => {
    it("is absent for non-admins", async () => {
      await setup();

      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Insights" }),
      ).not.toBeInTheDocument();
    });

    it("opens the usage analytics upsell for admins", async () => {
      await setup({
        user: { is_superuser: true },
        settings: createMockSettings({
          "token-features": createMockTokenFeatures({
            audit_app: false,
          }),
        }),
      });

      await userEvent.click(screen.getByRole("button", { name: "Insights" }));

      expect(
        await screen.findByText(/See who.s doing what, when/),
      ).toBeInTheDocument();
    });
  });
});
