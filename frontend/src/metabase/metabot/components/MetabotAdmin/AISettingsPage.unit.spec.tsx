import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupPropertiesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  setupMetabotPromptSuggestionsEndpoint,
  setupMetabotsEndpoints,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import { buildDefaultMetabots } from "metabase/metabot/tests/utils";
import { reinitialize } from "metabase/plugins";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import {
  createMockCollection,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { AISettingsPage } from "./AISettingsPage";

const defaultSeedCollections = [
  createMockCollection({ id: "root", name: "Our Analytics" }),
];

const setup = async ({
  aiFeaturesEnabled = true,
  enableEmbedding = false,
  contentVerification = false,
  initialRoute = "/admin/metabot",
  isConfigured = true,
  metabots = buildDefaultMetabots(),
  collections = defaultSeedCollections,
}: {
  aiFeaturesEnabled?: boolean;
  enableEmbedding?: boolean;
  contentVerification?: boolean;
  initialRoute?: string;
  isConfigured?: boolean;
  metabots?: Parameters<typeof setupMetabotsEndpoints>[0];
  collections?: Parameters<
    typeof setupCollectionByIdEndpoint
  >[0]["collections"];
} = {}) => {
  const tokenFeatures = createMockTokenFeatures({
    embedding_sdk: enableEmbedding,
    content_verification: contentVerification,
  });

  mockSettings({ "token-features": tokenFeatures });
  setupEnterprisePlugins();

  const settings = createMockSettings({
    "ai-features-enabled?": aiFeaturesEnabled,
    "agent-api-enabled?": true,
    "embedded-metabot-enabled?": true,
    "llm-metabot-configured?": isConfigured,
    "llm-metabot-provider": null,
    "mcp-enabled?": true,
    "metabot-enabled?": true,
    "token-features": tokenFeatures,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "llm-metabot-provider",
      value: null,
    }),
    createMockSettingDefinition({
      key: "llm-anthropic-api-key",
      value: undefined,
    }),
    createMockSettingDefinition({
      key: "llm-openai-api-key",
      value: undefined,
    }),
    createMockSettingDefinition({
      key: "llm-openrouter-api-key",
      value: undefined,
    }),
  ]);
  setupUpdateSettingEndpoint();
  setupCollectionByIdEndpoint({ collections });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionsEndpoints({ collections: [] });
  setupRecentViewsAndSelectionsEndpoints(defaultSeedCollections as any);
  setupMetabotsEndpoints(metabots);

  [FIXED_METABOT_IDS.DEFAULT, FIXED_METABOT_IDS.EMBEDDED].forEach((metabotId) =>
    setupMetabotPromptSuggestionsEndpoint({
      metabotId,
      prompts: [],
      paginationContext: {
        offset: 0,
        limit: 10,
        total: 0,
      },
    }),
  );

  const view = renderWithProviders(
    <Route path="/admin/metabot*" component={AISettingsPage} />,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  await screen.findByText("Disable all AI features");

  return view;
};

describe("AISettingsPage", () => {
  afterEach(() => {
    reinitialize();
    jest.restoreAllMocks();
  });

  it("shows all sections on one page and disables non-connection sections until configured", async () => {
    await setup({ isConfigured: false, enableEmbedding: true });

    expect(screen.getByText("Connect to an AI provider")).toBeInTheDocument();
    expect(screen.getByText("Metabot settings")).toBeInTheDocument();
    expect(screen.getByText("Enable Metabot")).toBeInTheDocument();
    expect(screen.getByText("MCP server")).toBeInTheDocument();
    expect(screen.getByText("Agent API")).toBeInTheDocument();

    expect(
      screen.getByText("Enable Metabot", {
        selector: '[aria-disabled="true"] *',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("MCP server", {
        selector: '[aria-disabled="true"] *',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Agent API", {
        selector: '[aria-disabled="true"] *',
      }),
    ).not.toBeInTheDocument();
  });

  it("shows docs links for MCP and Agent API", async () => {
    await setup();

    expect(
      screen
        .getAllByRole("link", { name: "Learn more" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        "https://www.metabase.com/docs/latest/ai/mcp.html",
        "https://www.metabase.com/docs/latest/ai/agent-api.html",
      ]),
    );
  });

  it("hides every other section when AI features are disabled", async () => {
    await setup({ aiFeaturesEnabled: false });

    expect(
      screen.queryByText("Connect to an AI provider"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Metabot settings")).not.toBeInTheDocument();
    expect(screen.queryByText("MCP server")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent API")).not.toBeInTheDocument();
    expect(screen.getByText("Disable all AI features")).toBeInTheDocument();
  });

  it("keeps the embedded deep link working by selecting the embedded tab", async () => {
    await setup({
      enableEmbedding: true,
      initialRoute: `/admin/metabot/${FIXED_METABOT_IDS.EMBEDDED}#metabot`,
    });

    expect(
      screen.getByRole("tab", { name: "Embedded", selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enable Embedded Metabot")).toBeInTheDocument();
  });

  it("reflects the persisted use_verified_content state from the API", async () => {
    await setup({
      contentVerification: true,
      metabots: buildDefaultMetabots({
        default: { use_verified_content: true },
      }),
    });

    expect(
      await screen.findByRole("switch", {
        name: "Only use Verified content",
      }),
    ).toBeChecked();
  });

  it("reflects the persisted collection_id from the API", async () => {
    const verifiedCollection = createMockCollection({
      id: 42,
      name: "Verified content",
    });

    await setup({
      collections: [...defaultSeedCollections, verifiedCollection],
      metabots: buildDefaultMetabots({
        default: { collection_id: 42 },
      }),
    });

    expect(await screen.findByText("Verified content")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: "Pick a different collection",
      }),
    ).toBeInTheDocument();
  });

  it("persists disable ai features", async () => {
    await setup();

    await userEvent.click(
      screen.getByRole("switch", { name: "Disable all AI features" }),
    );

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    expect(puts[0].url).toContain("/setting/ai-features-enabled%3F");
    expect(puts[0].body).toEqual({ value: false });
  });
});
