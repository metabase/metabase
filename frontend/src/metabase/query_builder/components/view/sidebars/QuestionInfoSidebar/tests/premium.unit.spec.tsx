import { screen, within } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockModerationReview,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts) => {
  return baseSetup({
    ...opts,
    settings: createMockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: true,
        cache_granular_controls: true,
        serialization: true,
        audit_app: true,
        official_collections: true,
      }),
    }),
    hasEnterprisePlugins: true,
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
      await setup({ card });
      expect(screen.getByText(/verified this/)).toBeInTheDocument();
    });

    it("should not show the verification badge for unverified content", async () => {
      const card = createMockCard();
      await setup({ card });
      expect(screen.queryByText(/verified this/)).not.toBeInTheDocument();
    });
  });

  describe("analytics content", () => {
    it("should show the history section for non analytics content", async () => {
      await setup({
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
      await setup({ card });

      expect(screen.getByText("Entity ID")).toBeInTheDocument();
      expect(screen.getByText("jenny8675309")).toBeInTheDocument();
    });
  });

  it("should not show the history section for instance analytics question", async () => {
    await setup({
      card: createMockCard({
        collection: createMockCollection({ type: "instance-analytics" }),
      }),
    });

    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });

  it("should show collection with icon if collection is official", async () => {
    const card = createMockCard({
      collection: createMockCollection({
        name: "My little collection",
        authority_level: "official",
      }),
    });
    await setup({ card });

    const collectionSection = await screen.findByLabelText("Saved in");
    expect(
      within(collectionSection).getByText("My little collection"),
    ).toBeInTheDocument();
    expect(
      within(collectionSection).getByTestId("official-collection-marker"),
    ).toBeInTheDocument();
  });
});
