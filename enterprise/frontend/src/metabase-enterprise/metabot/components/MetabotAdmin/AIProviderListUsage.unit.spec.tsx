import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupMetabaseManagedAiEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { AIProviderList } from "metabase/metabot";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockLlmProviderConnection,
  createMockLlmProviderType,
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";

function setup({
  tokens = 4_000_000,
  freeTokens = null,
  hasManagedAi = true,
  hasDeprecatedAi = false,
  isLocked = false,
}: {
  tokens?: number | null;
  freeTokens?: number | null;
  hasManagedAi?: boolean;
  hasDeprecatedAi?: boolean;
  isLocked?: boolean;
} = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings({
    "is-hosted?": true,
    "llm-metabot-configured?": true,
    "token-features": createMockTokenFeatures({
      hosting: true,
      "metabase-ai-managed": hasManagedAi,
      "metabot-v3": hasDeprecatedAi,
    }),
    "token-status": createMockTokenStatus({
      features: [
        ...(hasManagedAi ? (["metabase-ai-managed"] as const) : []),
        ...(hasDeprecatedAi ? (["metabot-v3"] as const) : []),
      ],
    }),
  });

  setupPropertiesEndpoints(sessionProperties);
  setupSettingsEndpoints([]);
  setupMetabaseManagedAiEndpoints({
    metabasePricePerUnit: 3,
    metabotUsageQuota: {
      tokens,
      free_tokens: freeTokens,
      is_locked: isLocked,
      updated_at: null,
    },
  });
  fetchMock.post(
    "path:/api/premium-features/token/refresh",
    () => sessionProperties["token-status"],
  );

  setupLlmProviderTypesEndpoint([
    createMockLlmProviderType({
      type: "metabase",
      label: "Metabase AI service",
      managed: true,
      singleton: true,
      fields: [],
    }),
    createMockLlmProviderType(),
  ]);
  setupLlmProvidersEndpoint([
    createMockLlmProviderConnection({
      key: "metabase",
      type: "metabase",
      name: "Metabase AI service",
    }),
    createMockLlmProviderConnection(),
  ]);
  setupLlmModelsEndpoint([]);

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings(sessionProperties),
  });

  setupEnterpriseOnlyPlugin("metabot");

  renderWithProviders(<AIProviderList />, { storeInitialState });
}

describe("AIProviderList managed provider usage", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows the billing cycle usage under the managed provider by default", async () => {
    setup({ tokens: 4_000_000 });

    const row = await screen.findByTestId("provider-metabase");
    expect(await within(row).findByText("Current billing cycle")).toBeVisible();
    expect(within(row).getByText("4,000,000")).toBeInTheDocument();
    expect(
      await within(row).findByText("$3.00 per 1M tokens"),
    ).toBeInTheDocument();
    expect(within(row).getByText("$12.00")).toBeInTheDocument();
  });

  it("shows the remaining free trial tokens when there are any left", async () => {
    setup({ tokens: 250_000, freeTokens: 1_000_000 });

    const row = await screen.findByTestId("provider-metabase");
    expect(await within(row).findByText("Included use")).toBeVisible();
    expect(within(row).getByText("Free trial tokens")).toBeInTheDocument();
    expect(within(row).getByText("250,000 / 1,000,000")).toBeInTheDocument();
  });

  it("collapses the usage details on demand", async () => {
    setup();

    const row = await screen.findByTestId("provider-metabase");
    expect(await within(row).findByText("Current billing cycle")).toBeVisible();

    await userEvent.click(
      within(row).getByRole("button", { name: "Usage and pricing" }),
    );

    expect(within(row).getByText("Current billing cycle")).not.toBeVisible();
  });

  it("collapses the usage details when the provider name itself is clicked", async () => {
    setup();

    const row = await screen.findByTestId("provider-metabase");
    expect(await within(row).findByText("Current billing cycle")).toBeVisible();

    await userEvent.click(within(row).getByText("Metabase AI service"));

    expect(within(row).getByText("Current billing cycle")).not.toBeVisible();
  });

  it("does not offer usage details for a self-managed provider", async () => {
    setup();

    const row = await screen.findByTestId("provider-anthropic");
    expect(
      within(row).queryByRole("button", { name: "Usage and pricing" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer usage details on legacy tiered pricing with nothing to report", async () => {
    setup({ hasManagedAi: false, hasDeprecatedAi: true });

    const row = await screen.findByTestId("provider-metabase");
    expect(
      within(row).queryByRole("button", { name: "Usage and pricing" }),
    ).not.toBeInTheDocument();
  });

  it("offers to add a provider alongside the locked one, leaving the subscription and the connection alone", async () => {
    setup({ isLocked: true });

    const row = await screen.findByTestId("provider-metabase");
    await userEvent.click(
      await within(row).findByRole("button", {
        name: "Use a different AI provider",
      }),
    );

    const modal = await screen.findByRole("dialog", {
      name: "Add an AI provider",
    });
    expect(
      await within(modal).findByRole("button", { name: /Anthropic/ }),
    ).toBeInTheDocument();
    expect(
      within(modal).queryByRole("button", { name: /Metabase/ }),
    ).not.toBeInTheDocument();

    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/cloud-add-ons/metabase-ai-managed",
        { method: "DELETE" },
      ),
    ).toHaveLength(0);
    expect(screen.getByTestId("provider-metabase")).toBeInTheDocument();
  });
});
