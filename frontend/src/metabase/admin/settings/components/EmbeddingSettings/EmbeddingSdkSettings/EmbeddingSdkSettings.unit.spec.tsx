import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Settings } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { EmbeddingSdkSettings } from "./EmbeddingSdkSettings";

interface SetupOpts {
  showSdkEmbedTerms?: Settings["show-sdk-embed-terms"];
  isEmbeddingSdkEnabled?: Settings["enable-embedding-sdk"];
}

function setup({ showSdkEmbedTerms, isEmbeddingSdkEnabled }: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "show-sdk-embed-terms": showSdkEmbedTerms,
      "enable-embedding-sdk": isEmbeddingSdkEnabled,
      "token-features": createMockTokenFeatures({
        embedding_sdk: true,
      }),
    }),
  });

  setupEnterprisePlugins();

  const updateSetting = jest.fn();
  renderWithProviders(<EmbeddingSdkSettings updateSetting={updateSetting} />, {
    storeInitialState: state,
  });

  return {
    updateSetting,
  };
}

describe("EmbeddingSdkSettings", () => {
  describe("when enable-embedding-sdk=true & show-sdk-embed-terms=true", () => {
    beforeEach(() => {
      setup({
        isEmbeddingSdkEnabled: true,
        showSdkEmbedTerms: true,
      });
    });

    it("should disable CORS settings and open modal when user clicks on the text box, after user declines legalese", async () => {
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
    it("should show the modal when the user clicks the toggle", async () => {
      setup({
        isEmbeddingSdkEnabled: false,
        showSdkEmbedTerms: true,
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("checkbox"));
      assertLegaleseModal();
    });
  });

  describe("when enable-embedding-sdk=false & show-sdk-embed-terms=false", () => {
    it("should not show the modal when the user clicks the toggle", async () => {
      const { updateSetting } = setup({
        isEmbeddingSdkEnabled: false,
        showSdkEmbedTerms: false,
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("checkbox"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await waitFor(() => {
        expect(updateSetting).toHaveBeenCalledTimes(2);
      });

      expect(updateSetting).toHaveBeenNthCalledWith(
        1,
        { key: "show-sdk-embed-terms" },
        false,
      );
      expect(updateSetting).toHaveBeenNthCalledWith(
        2,
        { key: "enable-embedding-sdk" },
        true,
      );
    });
  });
});

function assertLegaleseModal() {
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  expect(screen.getByText("First, some legalese")).toBeInTheDocument();
  expect(screen.getByText("Decline and go back")).toBeInTheDocument();
  expect(screen.getByText("Agree and continue")).toBeInTheDocument();
}
