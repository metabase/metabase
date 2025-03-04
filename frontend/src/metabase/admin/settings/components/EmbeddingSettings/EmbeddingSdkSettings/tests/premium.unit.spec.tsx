import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";
import { assertLegaleseModal } from "./util";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { embedding_sdk: true },
    ...opts,
  });

describe("EmbeddingSdkSettings (EE with Embedding SDK token)", () => {
  it("should not tell users to upgrade or switch binaries", () => {
    setup({
      isEmbeddingSdkEnabled: true,
      showSdkEmbedTerms: false,
    });
    expect(
      screen.getByText(
        /You can test Embedded analytics SDK on localhost quickly by using API keys/i,
      ),
    ).toBeInTheDocument();

    const alertInfo = within(screen.getByTestId("sdk-settings-alert-info"));
    // should only be shown on non-EE instances
    expect(
      alertInfo.queryByText("switch Metabase binaries"),
    ).not.toBeInTheDocument();
    expect(
      alertInfo.queryByText("upgrade to Metabase Pro"),
    ).not.toBeInTheDocument();
    expect(alertInfo.getByText("implement JWT SSO")).toBeInTheDocument();
  });

  describe("Version pinning", () => {
    it("should offer users version pinning when they have a cloud instance", () => {
      setup({
        isHosted: true,
      });

      expect(screen.getByText("Version pinning")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Metabase Cloud instances are automatically upgraded to new releases/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Request version pinning" }),
      ).toBeInTheDocument();
    });

    it("should not offer users version pinning on self hosted instances", () => {
      setup({
        isHosted: false,
      });

      expect(screen.queryByText("Version pinning")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Request version pinning" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Modal behavior based on enable-embedding-sdk and show-sdk-embed-terms", () => {
    describe("when enable-embedding-sdk=true & show-sdk-embed-terms=true", () => {
      beforeEach(() => {
        setup({
          isEmbeddingSdkEnabled: true,
          showSdkEmbedTerms: true,
        });
      });

      it("should show the modal when the user loads the page", () => {
        expect(
          screen.getByText("Embedded analytics SDK for React"),
        ).toBeInTheDocument();
        assertLegaleseModal();
      });

      it("should show the modal when the user declines the modal then tries to edit CORS settings", async () => {
        expect(
          screen.getByText("Embedded analytics SDK for React"),
        ).toBeInTheDocument();
        assertLegaleseModal();
        await userEvent.click(screen.getByText("Decline and go back"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByPlaceholderText("https://*.example.com"),
        );
        assertLegaleseModal();
      });
    });

    describe("when enable-embedding-sdk=true & show-sdk-embed-terms=false", () => {
      beforeEach(() => {
        setup({
          isEmbeddingSdkEnabled: true,
          showSdkEmbedTerms: false,
        });
      });

      it("should not show the modal when the user loads the page", () => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    describe("when enable-embedding-sdk=false & show-sdk-embed-terms=true", () => {
      it("should update settings when user accepts the SDK terms", async () => {
        const { updateSetting } = setup({
          isEmbeddingSdkEnabled: false,
          showSdkEmbedTerms: true,
        });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("switch"));
        assertLegaleseModal();

        await userEvent.click(screen.getByText("Agree and continue"));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        expect(updateSetting).toHaveBeenCalledTimes(2);

        expect(updateSetting).toHaveBeenCalledWith(
          { key: "enable-embedding-sdk" },
          true,
        );
        expect(updateSetting).toHaveBeenCalledWith(
          { key: "show-sdk-embed-terms" },
          false,
        );
      });

      it("should not update settings when user declines the SDK terms", async () => {
        const { updateSetting } = setup({
          isEmbeddingSdkEnabled: false,
          showSdkEmbedTerms: true,
        });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("switch"));
        assertLegaleseModal();

        await userEvent.click(screen.getByText("Decline and go back"));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        expect(updateSetting).not.toHaveBeenCalled();
      });
    });

    describe("when enable-embedding-sdk=false & show-sdk-embed-terms=false", () => {
      it("should not show the modal when the user clicks the toggle", async () => {
        const { updateSetting } = setup({
          isEmbeddingSdkEnabled: false,
          showSdkEmbedTerms: false,
        });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("switch"));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        expect(updateSetting).toHaveBeenCalledTimes(1);

        expect(updateSetting).toHaveBeenCalledWith(
          { key: "enable-embedding-sdk" },
          true,
        );
      });
    });
  });
});
