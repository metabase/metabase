import {
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import type { TokenFeatures } from "metabase-types/api";
import { createMockSettingDefinition } from "metabase-types/api/mocks";

import { EmbeddingIframeSdkOptionCard } from "../EmbeddingIframeSdkOptionCard";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(setupOpts: SetupOpts = {}) {
  const { state } = baseSetup(setupOpts);

  // Setup settings endpoints with proper iframe SDK setting
  const iframeSDKSetting =
    setupOpts.settingValues?.["enable-embedding-iframe-sdk"] ?? false;

  let settingValue: any;
  let isEnvSetting = false;

  if (typeof iframeSDKSetting === "object" && iframeSDKSetting !== null) {
    // Handle the env var case: { value: true, is_env_setting: true }
    settingValue = iframeSDKSetting.value;
    isEnvSetting = iframeSDKSetting.is_env_setting;
  } else {
    // Handle the simple boolean case
    settingValue = iframeSDKSetting;
  }

  const settings = [
    createMockSettingDefinition({
      key: "enable-embedding-iframe-sdk",
      value: settingValue,
      is_env_setting: isEnvSetting,
    }),
    // Add show-sdk-embed-terms setting to match what the component expects
    createMockSettingDefinition({
      key: "show-sdk-embed-terms",
      value: true,
      is_env_setting: false,
    }),
  ];

  setupSettingsEndpoints(settings);
  setupUpdateSettingEndpoint();

  // Mock PLUGIN_EMBEDDING based on enterprise plugins setting
  const isEE = setupOpts.hasEnterprisePlugins ?? false;
  jest.spyOn(PLUGIN_EMBEDDING, "isEnabled").mockReturnValue(isEE);

  return { state };
}

const commonTests = (setupOpts: SetupOpts) => {
  it("displays the embed card", () => {
    const { state } = setup(setupOpts);
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });

    expect(
      screen.getByText("Embedded analytics SDK for iframe"),
    ).toBeInTheDocument();

    expect(screen.getByText("Pro and Enterprise")).toBeInTheDocument();
  });

  it("shows 'Try it out' button for non-EE instances", () => {
    // Skip this test if enterprise plugins are enabled
    if (setupOpts.hasEnterprisePlugins) {
      return;
    }

    const { state } = setup(setupOpts);
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });

    expect(
      screen.getByRole("button", { name: "Try it out" }),
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
    expect(
      screen.getByRole("button", { name: "Configure" }),
    ).toBeInTheDocument();
  });

  describe("embedding toggle", () => {
    it("displays 'Disabled' when iframe embedding SDK is disabled", async () => {
      const { state } = setup({
        ...setupOpts,
        settingValues: { "enable-embedding-iframe-sdk": false },
      });

      renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
        storeInitialState: state,
      });

      await waitFor(() => {
        expect(screen.getByRole("switch")).toBeInTheDocument();
      });

      expect(screen.getByRole("switch")).not.toBeChecked();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });

    it("shows environment variable text when setting is controlled by env var", async () => {
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

      await waitFor(() => {
        expect(
          screen.getByText("Set via environment variable"),
        ).toBeInTheDocument();
      });
    });
  });
};

describe("EmbeddingIframeSdkOptionCard", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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
