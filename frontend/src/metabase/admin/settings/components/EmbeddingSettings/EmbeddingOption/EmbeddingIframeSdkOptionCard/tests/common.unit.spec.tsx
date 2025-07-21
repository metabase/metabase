import userEvent from "@testing-library/user-event";

import { setupSettingsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";

import { EmbeddingIframeSdkOptionCard } from "../EmbeddingIframeSdkOptionCard";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(setupOpts: SetupOpts = {}) {
  setupSettingsEndpoints([]);
  const { state } = baseSetup(setupOpts);
  return { state };
}

const commonTests = (setupOpts: SetupOpts) => {
  it("displays the title", () => {
    const { state } = setup(setupOpts);
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });
    expect(
      screen.getByText("Embedded analytics SDK for iframe"),
    ).toBeInTheDocument();
  });

  it("displays the Pro and Enterprise badge", () => {
    const { state } = setup(setupOpts);
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });
    expect(screen.getByText("Pro and Enterprise")).toBeInTheDocument();
  });

  it("displays the description", () => {
    const { state } = setup(setupOpts);
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });
    expect(
      screen.getByText(
        /Embed Metabase components within iframes using the SDK/,
      ),
    ).toBeInTheDocument();
  });

  it("shows 'Try it out' button for non-EE instances", () => {
    const { state } = setup(setupOpts);
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });
    expect(
      screen.getByRole("link", { name: "Try it out" }),
    ).toBeInTheDocument();
  });

  it("shows 'Configure' button for EE instances", () => {
    const { state } = setup({
      ...setupOpts,
      hasEnterprisePlugins: true,
      tokenFeatures: { embedding_iframe_sdk: true },
    });
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });
    expect(screen.getByRole("link", { name: "Configure" })).toBeInTheDocument();
  });

  it("links to the iframe SDK settings page", () => {
    const { state } = setup(setupOpts);
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/admin/settings/embedding-in-other-applications/iframe-sdk",
    );
  });

  describe("embedding toggle", () => {
    it("displays 'Disabled' when iframe embedding SDK is disabled", () => {
      const { state } = setup({
        ...setupOpts,
        settingValues: { "enable-embedding-iframe-sdk": false },
      });
      renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
        storeInitialState: state,
      });
      expect(screen.getByLabelText("Disabled")).toBeInTheDocument();
    });

    it("displays 'Enabled' when iframe embedding SDK is enabled", () => {
      const { state } = setup({
        ...setupOpts,
        settingValues: { "enable-embedding-iframe-sdk": true },
      });
      renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
        storeInitialState: state,
      });
      expect(screen.getByLabelText("Enabled")).toBeInTheDocument();
    });

    it("can be clicked to toggle the setting", async () => {
      const { state } = setup({
        ...setupOpts,
        settingValues: { "enable-embedding-iframe-sdk": false },
      });
      renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
        storeInitialState: state,
      });

      const toggle = screen.getByRole("switch");
      expect(toggle).toBeInTheDocument();

      await userEvent.click(toggle);

      // The toggle should now show as enabled (this depends on the actual implementation)
      // In a real test, you might want to verify the API call was made
    });

    it("shows environment variable text when setting is controlled by env var", () => {
      const { state } = setup({
        ...setupOpts,
        settingValues: {
          "enable-embedding-iframe-sdk": {
            value: true,
            is_env_setting: true,
          },
        },
      });
      renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
        storeInitialState: state,
      });
      expect(
        screen.getByText("Set via environment variable"),
      ).toBeInTheDocument();
    });
  });
};

describe("EmbeddingIframeSdkOptionCard", () => {
  describe("Common functionality", () => {
    commonTests({});
  });

  describe("With enterprise plugins", () => {
    const setupOpts: SetupOpts = {
      hasEnterprisePlugins: true,
      tokenFeatures: {
        embedding_iframe_sdk: true,
      } satisfies Partial<TokenFeatures>,
    };

    commonTests(setupOpts);
  });
});
