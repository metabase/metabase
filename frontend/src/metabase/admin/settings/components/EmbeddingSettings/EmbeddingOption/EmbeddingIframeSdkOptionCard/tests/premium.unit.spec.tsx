import {
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { createMockSettingDefinition } from "metabase-types/api/mocks";

import { EmbeddingIframeSdkOptionCard } from "../EmbeddingIframeSdkOptionCard";

import { setup as baseSetup } from "./setup";

const setup = () => {
  const { state } = baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: { embedding_iframe_sdk: true },
  });

  const settings = [
    createMockSettingDefinition({
      key: "enable-embedding-iframe-sdk",
      value: false,
      is_env_setting: false,
    }),
    createMockSettingDefinition({
      key: "show-sdk-embed-terms",
      value: true,
      is_env_setting: false,
    }),
  ];

  setupSettingsEndpoints(settings);
  setupUpdateSettingEndpoint();

  // Mock PLUGIN_EMBEDDING for EE
  jest.spyOn(PLUGIN_EMBEDDING, "isEnabled").mockReturnValue(true);

  return { state };
};

describe("EmbeddingIframeSdkOptionCard (EE with token)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows 'Configure' button for EE instances", () => {
    const { state } = setup();
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });
    expect(
      screen.getByRole("button", { name: "Configure" }),
    ).toBeInTheDocument();
  });
});
