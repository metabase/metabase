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

      describe("when static embedding is disabled", () => {});

      describe("when static embedding is enabled", () => {
        it("should switch to StaticEmbedSetupPane", async () => {
          const { goToNextStep } = setup({
            enableEmbedding: {
              static: true,
              interactive: false,
              sdk: false,
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

    describe("Interactive Embedding", () => {});

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
              static: false,
              interactive: false,
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
          expect(
            withinSdkCard.queryByText("Disabled."),
          ).not.toBeInTheDocument();
          expect(
            withinSdkCard.queryByRole("link", {
              name: "Enabled in admin settings",
            }),
          ).not.toBeInTheDocument();
        });
      });
    });
  });
});
