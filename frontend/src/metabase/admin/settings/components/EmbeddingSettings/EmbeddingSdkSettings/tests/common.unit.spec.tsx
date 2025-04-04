import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

import { setup } from "./setup";
import { assertLegaleseModal } from "./util";

describe("EmbeddingSdkSettings (OSS)", () => {
  describe("banner text when user is self-hosted or cloud", () => {
    it("should tell users to use localhost and API keys to test the SDK", () => {
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
      expect(
        alertInfo.getByText("switch Metabase binaries"),
      ).toBeInTheDocument();
      expect(
        alertInfo.getByText("upgrade to Metabase Pro"),
      ).toBeInTheDocument();
      expect(alertInfo.getByText("implement JWT SSO")).toBeInTheDocument();
    });

    it("should not tell users to switch binaries when they have a cloud instance", () => {
      setup({
        isEmbeddingSdkEnabled: true,
        showSdkEmbedTerms: false,
        isHosted: true,
      });
      expect(
        screen.getByText(
          /You can test Embedded analytics SDK on localhost quickly by using API keys/i,
        ),
      ).toBeInTheDocument();

      const alertInfo = within(screen.getByTestId("sdk-settings-alert-info"));
      expect(
        alertInfo.queryByText("switch Metabase binaries"),
      ).not.toBeInTheDocument();
      expect(
        alertInfo.getByText("upgrade to Metabase Pro"),
      ).toBeInTheDocument();
      expect(alertInfo.getByText("implement JWT SSO")).toBeInTheDocument();
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
