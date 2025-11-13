import { screen, within } from "@testing-library/react";

import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { type SetupOpts, setup } from "./setup";

function setupPremium(opts?: Partial<SetupOpts>) {
  setup({
    ...opts,
    hasEnterprisePlugins: true,
    tokenFeatures: createMockTokenFeatures({ embedding_simple: true }),
    isHosted: true,
  });
}

describe("EmbedModalContent", () => {
  describe("Interactive Embedding", () => {
    const INTERACTIVE_EMBEDDING_TITLE = "Embedded Analytics JS";

    describe("when Interactive Embedding is disabled", () => {
      it("should mention Interactive Embedding and tell admin to enable Interactive Embedding in the setting", () => {
        setupPremium();

        // The card is not clickable
        expect(
          screen.queryByRole("link", { name: INTERACTIVE_EMBEDDING_TITLE }),
        ).not.toBeInTheDocument();

        // We show the link at the bottom of the card
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", { name: INTERACTIVE_EMBEDDING_TITLE }),
        );
        expect(
          withinInteractiveEmbeddingCard.getByText("Disabled."),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.getByRole("link", {
            name: "Enable in admin settings",
          }),
        ).toHaveAttribute("href", "/admin/embedding/modular");
      });
    });

    describe("when Interactive Embedding is enabled", () => {
      it("should mention Interactive Embedding and link to its admin settings page", () => {
        setupPremium({
          enableEmbedding: {
            interactive: true,
          },
        });

        // We don't show the link at the bottom of the card
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", { name: INTERACTIVE_EMBEDDING_TITLE }),
        );
        expect(
          withinInteractiveEmbeddingCard.queryByText("Disabled."),
        ).not.toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.queryByRole("link", {
            name: "Enabled in admin settings",
          }),
        ).not.toBeInTheDocument();
      });
    });
  });
});
