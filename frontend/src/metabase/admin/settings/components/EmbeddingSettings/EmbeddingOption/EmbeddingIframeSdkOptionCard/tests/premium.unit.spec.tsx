import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import type { Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EmbeddingIframeSdkOptionCard } from "../EmbeddingIframeSdkOptionCard";

interface SetupOpts {
  showSdkEmbedTerms?: Settings["show-sdk-embed-terms"];
  isEmbeddingIframeSdkEnabled?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

async function setup({
  showSdkEmbedTerms = true,
  isEmbeddingIframeSdkEnabled = false,
  hasEnterprisePlugins = true,
}: SetupOpts = {}) {
  const settingValues = createMockSettings({
    "show-sdk-embed-terms": showSdkEmbedTerms,
    "enable-embedding-simple": isEmbeddingIframeSdkEnabled,
    "token-features": createMockTokenFeatures({
      embedding_iframe_sdk: true,
    }),
  });

  const settingDefinitions = [
    createMockSettingDefinition({
      key: "show-sdk-embed-terms",
      value: showSdkEmbedTerms,
    }),
    createMockSettingDefinition({
      key: "enable-embedding-simple",
      value: isEmbeddingIframeSdkEnabled,
    }),
  ];

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupSettingsEndpoints(settingDefinitions);
  setupPropertiesEndpoints(settingValues);
  setupUpdateSettingEndpoint();

  jest
    .spyOn(PLUGIN_EMBEDDING, "isEnabled")
    .mockReturnValue(hasEnterprisePlugins);

  renderWithProviders(<EmbeddingIframeSdkOptionCard />);

  // wait until both settings api endpoints (properties and setting) are called
  await waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets).toHaveLength(2);
  });
}

describe("EmbeddingIframeSdkOptionCard (EE with token)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enables the 'Configure' button for EE instances with token", async () => {
    await setup();

    expect(screen.getByRole("button", { name: "Configure" })).toBeEnabled();
  });

  it("shows the legalese modal when the user hasn't agreed to terms", async () => {
    await setup({
      showSdkEmbedTerms: true,
      isEmbeddingIframeSdkEnabled: false,
    });

    const toggle = screen.getByRole("switch", { name: "Disabled" });
    await userEvent.click(toggle);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("updates enable-embedding-simple directly if the user had agreed to the terms", async () => {
    await setup({
      showSdkEmbedTerms: false,
      isEmbeddingIframeSdkEnabled: false,
    });

    const toggle = screen.getByRole("switch", { name: "Disabled" });
    await userEvent.click(toggle);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ url, body }] = puts;
    expect(url).toContain("api/setting/enable-embedding-simple");
    expect(body).toEqual({ value: true });
  });
});
