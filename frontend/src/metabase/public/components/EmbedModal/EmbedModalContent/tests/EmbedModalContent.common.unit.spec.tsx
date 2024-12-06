import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setup } from "./setup";

describe("EmbedModalContent", () => {
  describe("Static Embedding", () => {
    describe("Select Embed Type phase", () => {
      it("should render", () => {
        setup();

        expect(screen.getByText("Static embedding")).toBeInTheDocument();
        expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
        expect(screen.getByText("Embedded analytics SDK")).toBeInTheDocument();
      });
    });

    describe("when Static Embedding is disabled", () => {
      const STATIC_EMBEDDING_TITLE = "Static embedding";

      it("should mention Static Embedding and tell admin to enable Static Embedding in the setting", () => {
        setup();

        // The card is not clickable
        expect(
          screen.queryByRole("link", { name: STATIC_EMBEDDING_TITLE }),
        ).not.toBeInTheDocument();

        // We show the link at the bottom of the card
        const withinStaticEmbeddingCard = within(
          screen.getByRole("article", { name: STATIC_EMBEDDING_TITLE }),
        );
        expect(
          withinStaticEmbeddingCard.getByText("Disabled."),
        ).toBeInTheDocument();
        expect(
          withinStaticEmbeddingCard.getByRole("link", {
            name: "Enable in admin settings",
          }),
        ).toHaveAttribute(
          "href",
          "/admin/settings/embedding-in-other-applications/standalone",
        );
      });
    });

    describe("when Static Embedding is enabled", () => {
      it("should switch to StaticEmbedSetupPane", async () => {
        const { goToNextStep } = setup({
          enableEmbedding: {
            static: true,
          },
        });

        expect(goToNextStep).toHaveBeenCalledTimes(0);

        await userEvent.click(screen.getByText("Static embedding"));

        expect(goToNextStep).toHaveBeenCalledTimes(1);
      });

      it("should render StaticEmbedSetupPane when embedType=application", () => {
        setup({
          props: {
            embedType: "application",
          },
        });

        expect(
          screen.getByText("Setting up a static embed"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Interactive Embedding", () => {
    const INTERACTIVE_EMBEDDING_TITLE = "Interactive embedding";

    describe("when Interactive Embedding is disabled", () => {
      it("should mention Interactive Embedding and lead users to learn more link", () => {
        setup();

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
        setup({
          enableEmbedding: {
            interactive: true,
          },
        });

        // The card is clickable
        expect(
          screen.queryByRole("link", { name: INTERACTIVE_EMBEDDING_TITLE }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=upsell&utm_campaign=embedding-interactive&utm_content=static-embed-popover&source_plan=oss",
        );

        // We show the learn more link
        const withinInteractiveEmbedCard = within(
          screen.getByRole("article", { name: INTERACTIVE_EMBEDDING_TITLE }),
        );
        expect(
          withinInteractiveEmbedCard.getByText("Learn more"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Embedding SDK", () => {
    const SDK_TITLE = "Embedded analytics SDK";

    describe("when the SDK is disabled", () => {
      it("should mention the sdk and tell admin to enable the SDK in the setting", () => {
        setup();

        // The card is not clickable
        expect(
          screen.queryByRole("link", { name: SDK_TITLE }),
        ).not.toBeInTheDocument();

        // We show the link at the bottom of the card
        const withinSdkCard = within(
          screen.getByRole("article", { name: SDK_TITLE }),
        );
        expect(withinSdkCard.getByText("Disabled.")).toBeInTheDocument();
        expect(
          withinSdkCard.getByRole("link", {
            name: "Enable in admin settings",
          }),
        ).toHaveAttribute(
          "href",
          "/admin/settings/embedding-in-other-applications/sdk",
        );
      });
    });

    describe("when the SDK is enabled", () => {
      it("should mention the sdk and link to its admin settings page", () => {
        setup({
          enableEmbedding: {
            sdk: true,
          },
        });

        // The card is clickable
        expect(screen.getByRole("link", { name: SDK_TITLE })).toHaveProperty(
          "href",
          // I have no idea why only this URL is absolute in the test, it is relative in the markup 🤷
          "http://localhost/admin/settings/embedding-in-other-applications/sdk",
        );

        // We don't show the link at the bottom of the card
        const withinSdkCard = within(
          screen.getByRole("article", { name: SDK_TITLE }),
        );
        expect(withinSdkCard.queryByText("Disabled.")).not.toBeInTheDocument();
        expect(
          withinSdkCard.queryByRole("link", {
            name: "Enabled in admin settings",
          }),
        ).not.toBeInTheDocument();
      });
    });
  });
});
