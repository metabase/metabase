import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

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
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupMetabotPromptSuggestionsEndpoint,
  setupMetabotsEndpoints,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import { FIXED_METABOT_ENTITY_IDS } from "metabase/metabot/constants";
import { buildDefaultMetabots } from "metabase/metabot/tests/utils";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { AISettingsPage, McpSettingsPage } from "./AISettingsPage";

const defaultSeedCollections = [
  createMockCollection({ id: "root", name: "Our Analytics" }),
];

type Page = "ai-features" | "mcp";

function getPageRoute(page: Page) {
  switch (page) {
    case "mcp":
      return <Route path="/admin/metabot/mcp" element={<McpSettingsPage />} />;
    case "ai-features":
      return <Route path="/admin/metabot*" element={<AISettingsPage />} />;
  }
}

function getInitialRoute(page: Page) {
  switch (page) {
    case "mcp":
      return "/admin/metabot/mcp";
    case "ai-features":
      return "/admin/metabot";
  }
}

const DEPRECATED_AGENT_API_LABEL = "Agent API (deprecated)";

const deprecatedAgentApiSwitch = () =>
  screen.findByRole("switch", { name: DEPRECATED_AGENT_API_LABEL });

const getLastSettingUpdateCall = (settingKey: string) =>
  fetchMock.callHistory.lastCall(
    `path:/api/setting/${encodeURIComponent(settingKey)}`,
  );

type SetupOpts = {
  aiFeaturesEnabled?: boolean;
  deprecatedAgentApiEnabled?: boolean;
  deprecatedAgentApiEnvName?: string;
  enableEmbedding?: boolean;
  contentVerification?: boolean;
  initialRoute?: string;
  isConfigured?: boolean;
  metabots?: Parameters<typeof setupMetabotsEndpoints>[0];
  collections?: Parameters<
    typeof setupCollectionByIdEndpoint
  >[0]["collections"];
  page?: Page;
};

const setup = async ({
  aiFeaturesEnabled = true,
  deprecatedAgentApiEnabled = false,
  deprecatedAgentApiEnvName,
  enableEmbedding = false,
  contentVerification = false,
  initialRoute,
  isConfigured = true,
  metabots = buildDefaultMetabots(),
  collections = defaultSeedCollections,
  page = "ai-features",
}: SetupOpts = {}) => {
  const tokenFeatures = createMockTokenFeatures({
    embedding_sdk: enableEmbedding,
    content_verification: contentVerification,
  });

  mockSettings({ "token-features": tokenFeatures });
  setupEnterprisePlugins();

  const settings = createMockSettings({
    "ai-features-enabled?": aiFeaturesEnabled,
    "deprecated-agent-api-enabled?": deprecatedAgentApiEnabled,
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
      key: "deprecated-agent-api-enabled?",
      value: deprecatedAgentApiEnvName ? undefined : deprecatedAgentApiEnabled,
      is_env_setting: deprecatedAgentApiEnvName != null,
      env_name: deprecatedAgentApiEnvName,
    }),
  ]);
  setupUpdateSettingEndpoint();
  setupLlmProviderTypesEndpoint();
  setupLlmProvidersEndpoint();
  setupLlmModelsEndpoint();
  setupCollectionByIdEndpoint({ collections });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });
  setupCollectionsEndpoints({ collections: [] });
  // Unjustified type cast. FIXME
  setupRecentViewsAndSelectionsEndpoints(defaultSeedCollections as any);
  setupMetabotsEndpoints(metabots);

  metabots.forEach(({ id: metabotId }) =>
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

  const view = renderWithProviders(getPageRoute(page), {
    withRouter: true,
    initialRoute: initialRoute ?? getInitialRoute(page),
    storeInitialState: {
      settings: createMockSettingsState(settings),
    },
  });

  // Wait for the settings queries to settle before returning.
  // When AI features are off the MCP toggles stay disabled by design, so there we just await render.
  if (page === "mcp") {
    if (aiFeaturesEnabled) {
      await waitFor(() =>
        expect(
          screen.getByRole("switch", { name: "MCP server" }),
        ).toBeEnabled(),
      );
    } else {
      await screen.findByRole("switch", { name: "MCP server" });
    }
  } else {
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Disable all AI features" }),
      ).toBeEnabled(),
    );
  }

  return view;
};

describe("AISettingsPage", () => {
  afterEach(() => {
    reinitialize();
    jest.restoreAllMocks();
  });

  it("shows AI setup and metabot settings and disables metabot until configured", async () => {
    await setup({ isConfigured: false, enableEmbedding: true });

    expect(screen.getByText("Connect to an AI provider")).toBeInTheDocument();
    expect(screen.getByText("Metabot settings")).toBeInTheDocument();
    expect(screen.getByText("Enable Metabot")).toBeInTheDocument();
    expect(screen.queryByText("MCP server")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Agent API (deprecated)"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Enable Metabot", {
        selector: '[aria-disabled="true"] *',
      }),
    ).toBeInTheDocument();
  });

  it("shows docs links on the MCP page", async () => {
    await setup({ page: "mcp" });

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
    expect(screen.getByText("Disable all AI features")).toBeInTheDocument();
  });

  it("keeps MCP settings enabled when Metabot is not configured", async () => {
    await setup({ page: "mcp", isConfigured: false });

    expect(screen.getByRole("switch", { name: "MCP server" })).toBeEnabled();
    expect(await deprecatedAgentApiSwitch()).toBeEnabled();
  });

  it.each([false, true])(
    "shows the deprecated Agent API opt-in with the setting's value: %s",
    async (deprecatedAgentApiEnabled) => {
      await setup({ page: "mcp", deprecatedAgentApiEnabled });

      expect(
        await screen.findByRole("switch", {
          name: DEPRECATED_AGENT_API_LABEL,
          checked: deprecatedAgentApiEnabled,
        }),
      ).toBeInTheDocument();
      expect(screen.getByText(/removed in Metabase 67/)).toBeInTheDocument();
    },
  );

  it("persists opting in to the deprecated Agent API", async () => {
    await setup({ page: "mcp" });

    await userEvent.click(await deprecatedAgentApiSwitch());
    await waitForRequest(() =>
      getLastSettingUpdateCall("deprecated-agent-api-enabled?"),
    );
    const call = getLastSettingUpdateCall("deprecated-agent-api-enabled?");
    expect(call?.options?.body).toBe(JSON.stringify({ value: true }));
  });

  it("keeps keyboard focus on the deprecated Agent API opt-in while the write is pending", async () => {
    await setup({ page: "mcp" });
    let finishWrite: () => void = () => {};
    fetchMock.removeRoute("update-setting");
    fetchMock.put(
      new RegExp("/api/setting/"),
      new Promise((resolve) => {
        finishWrite = () => resolve({ status: 204 });
      }),
      { name: "update-setting" },
    );

    const toggle = await deprecatedAgentApiSwitch();
    toggle.focus();
    await userEvent.keyboard(" ");

    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-disabled", "true"),
    );
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveFocus();

    await userEvent.keyboard(" ");
    expect(
      fetchMock.callHistory.calls(
        `path:/api/setting/${encodeURIComponent("deprecated-agent-api-enabled?")}`,
      ),
    ).toHaveLength(1);

    finishWrite();
    await waitFor(() => expect(toggle).not.toHaveAttribute("aria-disabled"));
    expect(toggle).toHaveFocus();
  });

  it("locks the deprecated Agent API opt-in to the value an env var sets", async () => {
    await setup({
      page: "mcp",
      deprecatedAgentApiEnabled: true,
      deprecatedAgentApiEnvName: "MB_DEPRECATED_AGENT_API_ENABLED",
    });

    const toggle = await deprecatedAgentApiSwitch();
    expect(
      await screen.findByTestId("setting-env-var-message"),
    ).toHaveTextContent("MB_DEPRECATED_AGENT_API_ENABLED");
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
  });

  it("disables MCP settings when all AI features are disabled", async () => {
    await setup({ page: "mcp", aiFeaturesEnabled: false });

    expect(
      screen.getByText("MCP server", {
        selector: '[aria-disabled="true"] *',
      }),
    ).toBeInTheDocument();
    expect(await deprecatedAgentApiSwitch()).toBeDisabled();
  });

  it.each([FIXED_METABOT_ENTITY_IDS.EMBEDDED, "2"])(
    "selects the embedded Metabot for %s",
    async (metabotId) => {
      await setup({
        enableEmbedding: true,
        initialRoute: `/admin/metabot?metabot_id=${metabotId}`,
        metabots: buildDefaultMetabots({
          default: { id: 41 },
          embedded: { id: 42 },
        }),
      });

      expect(
        screen.getByRole("tab", { name: "Embedded", selected: true }),
      ).toBeInTheDocument();
      expect(screen.getByText("Enable Embedded Metabot")).toBeInTheDocument();
    },
  );

  it("reflects the persisted use_verified_content state from the API", async () => {
    await setup({
      contentVerification: true,
      metabots: buildDefaultMetabots({
        default: { id: 41, use_verified_content: true },
      }),
    });

    expect(
      await screen.findByRole("switch", {
        name: "Only use verified or curated content",
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

  it("switches tabs using a query param without changing the pathname", async () => {
    const { router } = await setup({
      enableEmbedding: true,
      initialRoute: "/admin/metabot",
    });

    await userEvent.click(screen.getByRole("tab", { name: "Embedded" }));

    expect(router?.location).toMatchObject({
      pathname: "/admin/metabot",
      search: `?metabot_id=${FIXED_METABOT_ENTITY_IDS.EMBEDDED}`,
      hash: "",
    });
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
