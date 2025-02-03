import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (options: SetupOpts = {}) =>
  baseSetup({
    hasEnterprisePlugins: true,
    hasEmbeddingTokenFeature: true,
    ...options,
  });

describe("EmbeddingSdkEnvVarSwitch", () => {
  describe("when show-sdk-embed-terms is true and SDK is enabled", () => {
    it("should open modal on component load", () => {
      setup({
        isEmbeddingSdkEnabled: true,
        showSdkEmbedTerms: true,
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should update settings when accepting terms", async () => {
      setup({
        isEmbeddingSdkEnabled: true,
        showSdkEmbedTerms: true,
      });

      const acceptButton = screen.getByRole("button", {
        name: "Accept and continue",
      });
      await userEvent.click(acceptButton);
      await assertToggleState({ shouldShowTerms: false, isSdkEnabled: true });
    });

    it("should update settings when declining terms", async () => {
      setup({
        isEmbeddingSdkEnabled: true,
        showSdkEmbedTerms: true,
      });

      const declineButton = screen.getByRole("button", {
        name: "Decline and go back",
      });
      await userEvent.click(declineButton);
      await assertToggleState({ shouldShowTerms: true, isSdkEnabled: false });
    });
  });

  describe("when show-sdk-embed-terms is true and SDK is disabled", () => {
    it("should open modal when switch is toggled", async () => {
      setup();

      const toggle = screen.getByRole("switch");
      await userEvent.click(toggle);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it.only("should update settings when accepting terms", async () => {
      setup({
        isEmbeddingSdkEnabled: false,
        showSdkEmbedTerms: true,
      });

      const toggle = screen.getByRole("checkbox");
      await userEvent.click(toggle);

      const acceptButton = screen.getByRole("button", {
        name: "Accept and continue",
      });
      await userEvent.click(acceptButton);
      await assertToggleState({ shouldShowTerms: false, isSdkEnabled: true });
    });

    it("should close modal without changes when declining", async () => {
      setup();

      const toggle = screen.getByRole("switch");
      await userEvent.click(toggle);

      const declineButton = screen.getByRole("button", { name: /decline/i });
      await userEvent.click(declineButton);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // TODO: Verify no settings were changed
    });
  });

  describe("when show-sdk-embed-terms is false", () => {
    it("should not show modal when toggling switch", async () => {
      // TODO: Need to know how to set show-sdk-embed-terms to false
      setup();

      const toggle = screen.getByRole("switch");
      await userEvent.click(toggle);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

async function assertToggleState({ isSdkEnabled, shouldShowTerms }) {
  await waitFor(() =>
    expect(
      fetchMock.called("path:api/setting/enable-embedding-sdk", {
        method: "PUT",
      }),
    ).toBe(isSdkEnabled),
  );

  await waitFor(() =>
    expect(
      fetchMock.called("path:api/setting/show-sdk-embed-terms", {
        method: "PUT",
      }),
    ).toBe(shouldShowTerms),
  );
}
