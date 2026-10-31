import userEvent from "@testing-library/user-event";

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
      expect(screen.getByText("You verified this")).toBeInTheDocument();
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
        // Unjustified type cast. FIXME
        entity_id: "jenny8675309" as Card["entity_id"],
      });
      await setupEnterprise({ card });

      await userEvent.click(
        screen.getByRole("button", { name: "Entity ID info" }),
      );

      expect(await screen.findByText("This question")).toBeInTheDocument();
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

  describe("insights action", () => {
    it("links non-admins with usage analytics access", async () => {
      await setupEnterprise({});

      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(
        await screen.findByRole("link", { name: "Insights" }),
      ).toBeInTheDocument();
    });

    it("links admins to usage analytics", async () => {
      await setupEnterprise({ user: { is_superuser: true } });

      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(
        await screen.findByRole("link", { name: "Insights" }),
      ).toBeInTheDocument();
    });
  });
});
