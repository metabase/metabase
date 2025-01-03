import { screen, within } from "@testing-library/react";

import { type SetupOpts, setup } from "./setup";

function setupEnterprise(opts?: Partial<SetupOpts>) {
  setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
}

describe("EmbedModalContent", () => {
  describe("Interactive Embedding", () => {
    const INTERACTIVE_EMBEDDING_TITLE = "Interactive embedding";

    describe("when Interactive Embedding is disabled", () => {
      it("should mention Interactive Embedding and lead users to learn more link", () => {
        setupEnterprise();

        // The card is clickable
        expect(
          screen.queryByRole("link", { name: INTERACTIVE_EMBEDDING_TITLE }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=upsell&utm_campaign=embedding-interactive&utm_content=static-embed-popover&source_plan=oss",
        );

        // We show the learn more link
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", { name: INTERACTIVE_EMBEDDING_TITLE }),
        );
        expect(
          withinInteractiveEmbeddingCard.getByText("Learn more"),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.queryByText("Disabled."),
        ).not.toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.queryByText(
            "Enable in admin settings",
          ),
        ).not.toBeInTheDocument();
      });
    });

    describe("when Interactive Embedding is enabled", () => {
      it("should mention Interactive Embedding and lead users to learn more link", () => {
        setupEnterprise();

        // The card is clickable
        expect(
          screen.queryByRole("link", { name: INTERACTIVE_EMBEDDING_TITLE }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=upsell&utm_campaign=embedding-interactive&utm_content=static-embed-popover&source_plan=oss",
        );

        // We show the learn more link
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", { name: INTERACTIVE_EMBEDDING_TITLE }),
        );
        expect(
          withinInteractiveEmbeddingCard.getByText("Learn more"),
        ).toBeInTheDocument();
      });
    });
  });
});
