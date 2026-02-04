import { screen } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockModerationReview,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

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
    enterprisePlugins: [
      "content_verification",
      "audit_app",
      "collections",
      "moderation",
    ],
  });
};

describe("QuestionInfoSidebar > premium", () => {
  describe("content verification", () => {
    it("should show the verification badge for verified content", async () => {
      const card = createMockCard({
        moderation_reviews: [
          createMockModerationReview({ status: "verified" }),
        ],
      });
      await setupEnterprise({ card });
      expect(screen.getByText(/verified this/)).toBeInTheDocument();
    });

    it("should not show the verification badge for unverified content", async () => {
      const card = createMockCard();
      await setupEnterprise({ card });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });
  });

  describe("analytics content", () => {
    it("should show the history section for non analytics content", async () => {
      await setupEnterprise({
        card: createMockCard({
          collection: createMockCollection(),
        }),
      });

      expect(await screen.findByText("History")).toBeInTheDocument();
    });
  });

  describe("entity id display", () => {
    it("should show entity ids only with serialization feature", async () => {
      const card = createMockCard({
        entity_id: "jenny8675309" as Card["entity_id"],
      });
      await setupEnterprise({ card });

      expect(screen.getByText("Entity ID")).toBeInTheDocument();
      expect(screen.getByText("jenny8675309")).toBeInTheDocument();
    });
  });

  it("should not show the history section for instance analytics question", async () => {
    await setupEnterprise({
      card: createMockCard({
        collection: createMockCollection({ type: "instance-analytics" }),
      }),
    });

    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });

  describe("tabs", () => {
    describe("for non-admins", () => {
      it("should show tabs for Overview, History, and Relationships, and no Insights link", async () => {
        setupEnterprise({});
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(3);
        expect(tabs.map((tab) => tab.textContent)).toEqual([
          "Overview",
          "History",
          "Relationships",
        ]);
        expect(
          screen.queryByRole("link", { name: "Insights" }),
        ).not.toBeInTheDocument();
      });
    });

    describe("for admins", () => {
      it("should show tabs for Overview, History, and Relationships, and a link for Insights", async () => {
        setupEnterprise({ user: { is_superuser: true } });
        const tabs = await screen.findAllByRole("tab");
        expect(tabs).toHaveLength(3);
        expect(tabs.map((tab) => tab.textContent)).toEqual([
          "Overview",
          "History",
          "Relationships",
        ]);
        expect(
          await screen.findByRole("link", { name: /Insights/ }),
        ).toBeInTheDocument();
      });
    });
  });
});
