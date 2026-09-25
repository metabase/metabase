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
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import { buildDefaultMetabots } from "metabase/metabot/tests/utils";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { SettingDefinition } from "metabase-types/api";
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

const setup = async ({
  aiFeaturesEnabled = true,
  enableEmbedding = false,
  contentVerification = false,
  initialRoute,
  isConfigured = true,
  metabots = buildDefaultMetabots(),
  collections = defaultSeedCollections,
  page = "ai-features",
  webSearchSetting = {},
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
  page?: Page;
  webSearchSetting?: Partial<SettingDefinition<"metabot-web-search-api-key">>;
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
      key: "metabot-web-search-api-key",
      value: null,
      ...webSearchSetting,
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

  const view = renderWithProviders(getPageRoute(page), {
    withRouter: true,
    withUndos: true,
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
    expect(screen.queryByText("Agent API")).not.toBeInTheDocument();

    expect(
      screen.getByText("Enable Metabot", {
        selector: '[aria-disabled="true"] *',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Web search", {
        selector: '[aria-disabled="true"] *',
      }),
    ).toBeInTheDocument();
  });

  it.each([FIXED_METABOT_IDS.DEFAULT, FIXED_METABOT_IDS.EMBEDDED])(
    "shows the shared web search setting for Metabot %s",
    async (metabotId) => {
      await setup({
        enableEmbedding: true,
        initialRoute: `/admin/metabot?metabot_id=${metabotId}`,
      });

      expect(screen.getByRole("heading", { name: "Web search" })).toBeVisible();
      expect(screen.getByLabelText("Serper API key")).toHaveAttribute(
        "type",
        "password",
      );
    },
  );

  it.each([
    { action: "adds", savedValue: null, newValue: "serper-new-key" },
    {
      action: "replaces",
      savedValue: "**********ld",
      newValue: "serper-new-key",
    },
    { action: "clears", savedValue: "**********ey", newValue: "" },
  ])("$action the Serper API key on blur", async ({ savedValue, newValue }) => {
    await setup({ webSearchSetting: { value: savedValue } });

    const input = screen.getByLabelText("Serper API key");
    await userEvent.clear(input);
    if (newValue) {
      await userEvent.type(input, newValue);
    }
    const refreshedValue = newValue ? "**********ey" : null;
    fetchMock.removeRoute("settings-list");
    setupSettingsEndpoints([
      createMockSettingDefinition({
        key: "metabot-web-search-api-key",
        value: refreshedValue,
      }),
    ]);
    await userEvent.tab();

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    const requests = await findRequests("PUT");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain(
      "/api/setting/metabot-web-search-api-key",
    );
    expect(requests[0].body).toEqual({ value: newValue });
    await waitFor(() => expect(input).toHaveValue(refreshedValue ?? ""));
  });

  it("keeps a masked Serper key unchanged when focused and blurred", async () => {
    await setup({ webSearchSetting: { value: "**********ey" } });

    const input = screen.getByLabelText("Serper API key");
    expect(input).toHaveValue("**********ey");
    await userEvent.click(input);
    await userEvent.tab();

    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("shows the environment variable instead of an editable Serper key", async () => {
    await setup({
      webSearchSetting: {
        is_env_setting: true,
        env_name: "MB_METABOT_WEB_SEARCH_API_KEY",
      },
    });

    expect(
      screen.getByText("MB_METABOT_WEB_SEARCH_API_KEY"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Serper API key")).not.toBeInTheDocument();
  });

  it("shows an error when saving the Serper key fails", async () => {
    await setup();
    setupUpdateSettingEndpoint({ status: 500 });

    const input = screen.getByLabelText("Serper API key");
    await userEvent.type(input, "serper-new-key");
    await userEvent.tab();

    expect(
      await screen.findByText("Error saving metabot-web-search-api-key"),
    ).toBeInTheDocument();
    expect(input).toHaveValue("serper-new-key");
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
    expect(screen.queryByText("Web search")).not.toBeInTheDocument();
    expect(screen.getByText("Disable all AI features")).toBeInTheDocument();
  });

  it("keeps MCP settings enabled when Metabot is not configured", async () => {
    await setup({ page: "mcp", isConfigured: false });

    expect(screen.getByRole("switch", { name: "MCP server" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Agent API" })).toBeEnabled();
  });

  it("disables MCP settings when all AI features are disabled", async () => {
    await setup({ page: "mcp", aiFeaturesEnabled: false });

    expect(
      screen.getByText("MCP server", {
        selector: '[aria-disabled="true"] *',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Agent API" })).toBeDisabled();
  });

  it("keeps the embedded deep link working by selecting the embedded tab", async () => {
    await setup({
      enableEmbedding: true,
      initialRoute: `/admin/metabot?metabot_id=${FIXED_METABOT_IDS.EMBEDDED}`,
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
      search: `?metabot_id=${FIXED_METABOT_IDS.EMBEDDED}`,
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
