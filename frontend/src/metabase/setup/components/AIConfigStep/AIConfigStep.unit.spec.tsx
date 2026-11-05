import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCreateLlmProviderEndpoint,
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupMetabaseManagedAiEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockSetupState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import type { SetupStep } from "metabase/redux/store";
import type {
  EnterpriseSettings,
  LlmProviderConnection,
  LlmProviderType,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockLlmConnectionModels,
  createMockLlmModel,
  createMockLlmProviderConnection,
  createMockLlmProviderField,
  createMockLlmProviderType,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIConfigStep } from "./AIConfigStep";

const ANTHROPIC_TYPE = createMockLlmProviderType({
  type: "anthropic",
  label: "Anthropic",
  fields: [
    createMockLlmProviderField({
      key: "api-key",
      label: "API key",
      type: "password",
      required: true,
      prefix: "sk-ant-",
    }),
  ],
});

const OPENAI_TYPE = createMockLlmProviderType({
  type: "openai",
  label: "OpenAI",
  fields: [
    createMockLlmProviderField({
      key: "api-key",
      label: "API key",
      type: "password",
      required: true,
    }),
  ],
});

const METABASE_TYPE = createMockLlmProviderType({
  type: "metabase",
  label: "Metabase AI service",
  managed: true,
  singleton: true,
  fields: [],
});

const ANTHROPIC_CONNECTION = createMockLlmProviderConnection({
  key: "anthropic",
  type: "anthropic",
  name: "Anthropic",
});

const OPENAI_CONNECTION = createMockLlmProviderConnection({
  key: "openai",
  type: "openai",
  name: "OpenAI",
});

const METABASE_CONNECTION = createMockLlmProviderConnection({
  key: "metabase",
  type: "metabase",
  name: "Metabase AI service",
});

interface SetupOpts {
  step?: SetupStep;
  settings?: Partial<EnterpriseSettings>;
  tokenFeatures?: Partial<TokenFeatures>;
  hasMetabotPlugin?: boolean;
  providerTypes?: LlmProviderType[];
  providerTypesFail?: boolean;
  connections?: LlmProviderConnection[];
  createdConnection?: LlmProviderConnection;
}

const setup = ({
  step = "ai_config",
  settings = {},
  tokenFeatures = {},
  hasMetabotPlugin = false,
  providerTypes = [ANTHROPIC_TYPE, OPENAI_TYPE],
  providerTypesFail = false,
  connections = [],
  createdConnection = ANTHROPIC_CONNECTION,
}: SetupOpts = {}) => {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings({
    ...settings,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    setup: createMockSetupState({ step, isAiConfigRequested: true }),
    settings: mockSettings(sessionProperties),
  });

  if (hasMetabotPlugin) {
    setupEnterpriseOnlyPlugin("metabot");
    setupMetabaseManagedAiEndpoints();
    fetchMock.post("path:/api/premium-features/token/refresh", 200);
  }

  fetchMock.get("path:/api/setting", []);
  setupPropertiesEndpoints(sessionProperties);
  if (providerTypesFail) {
    fetchMock.get("path:/api/llm/provider-types", {
      status: 500,
      body: { message: "Provider types are unavailable" },
    });
  } else {
    setupLlmProviderTypesEndpoint(providerTypes);
  }
  setupLlmProvidersEndpoint(connections);
  setupLlmModelsEndpoint([
    createMockLlmConnectionModels({
      key: "anthropic",
      name: "Anthropic",
      type: "anthropic",
      models: [
        createMockLlmModel({
          id: "claude-haiku-4-5",
          display_name: "Claude Haiku 4.5",
        }),
      ],
    }),
  ]);
  setupCreateLlmProviderEndpoint(createdConnection);

  renderWithProviders(<AIConfigStep stepLabel={5} />, {
    storeInitialState: state,
  });
};

const connectAnthropic = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Anthropic" }),
  );
  await userEvent.type(
    screen.getByLabelText(/API key/),
    "sk-ant-api03-unit-test-key",
  );

  setupLlmProvidersEndpoint([ANTHROPIC_CONNECTION]);
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
};

describe("AIConfigStep", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should render in inactive state", () => {
    setup({ step: "db_connection" });

    expect(screen.getByText("Connect to an AI provider")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Anthropic" }),
    ).not.toBeInTheDocument();
  });

  it("should not offer the managed provider without access to it", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: "Anthropic" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OpenAI" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Metabase AI service" }),
    ).not.toBeInTheDocument();
  });

  it("should offer the managed provider when the instance has access to it", async () => {
    setup({
      tokenFeatures: { "offer-metabase-ai-managed": true },
      hasMetabotPlugin: true,
      providerTypes: [METABASE_TYPE, ANTHROPIC_TYPE, OPENAI_TYPE],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Metabase AI service" }),
    );

    expect(
      await screen.findByText(
        /The simplest way to get started with AI in Metabase/,
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
      }),
    ).toBeInTheDocument();
  });

  it("should show the model picker instead of the provider picker when already connected", async () => {
    setup({
      connections: [ANTHROPIC_CONNECTION],
      settings: { "llm-metabot-provider": "anthropic/claude-sonnet-4-6" },
    });

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Anthropic" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "I'll set this up later" }),
    ).not.toBeInTheDocument();
  });

  it("should advance to the next step when skipping", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "I'll set this up later" }),
    );

    expect(await screen.findByText("I'll set up AI later")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Anthropic" }),
    ).not.toBeInTheDocument();
  });

  it("should show the model picker after connecting a provider", async () => {
    setup();

    await connectAnthropic();

    expect(await screen.findByLabelText("Model")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeInTheDocument();
  });

  it("should advance to the next step after confirming the connection", async () => {
    // the properties the client refetches after connecting already carry the reference the
    // backend wrote when it pointed Metabot at the new connection
    setup({
      settings: { "llm-metabot-provider": "anthropic/claude-sonnet-4-6" },
    });

    await connectAnthropic();
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(
      await screen.findByText("Connected to Anthropic"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("should connect the managed provider and advance to the next step", async () => {
    setup({
      settings: {
        "llm-metabot-provider": "metabase/anthropic/claude-sonnet-4-6",
      },
      tokenFeatures: {
        "offer-metabase-ai-managed": true,
        "metabase-ai-managed": true,
      },
      hasMetabotPlugin: true,
      providerTypes: [METABASE_TYPE, ANTHROPIC_TYPE, OPENAI_TYPE],
      createdConnection: METABASE_CONNECTION,
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Metabase AI service" }),
    );
    expect(
      await screen.findByText(
        /The simplest way to get started with AI in Metabase/,
      ),
    ).toBeInTheDocument();

    setupLlmProvidersEndpoint([METABASE_CONNECTION]);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("Connected to Metabase AI service"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/llm/providers", {
        method: "POST",
        body: { type: "metabase" },
      }),
    ).toBe(true);
  });

  it("should show the connected provider when completed after connecting", async () => {
    setup({
      step: "completed",
      connections: [ANTHROPIC_CONNECTION],
      settings: { "llm-metabot-provider": "anthropic/claude-sonnet-4-6" },
    });

    expect(
      await screen.findByText("Connected to Anthropic"),
    ).toBeInTheDocument();
  });

  it("should report the provider the picked model belongs to, not the first usable connection", async () => {
    setup({
      step: "completed",
      connections: [ANTHROPIC_CONNECTION, OPENAI_CONNECTION],
      settings: { "llm-metabot-provider": "openai/gpt-5.4" },
    });

    expect(await screen.findByText("Connected to OpenAI")).toBeInTheDocument();
  });

  it("should show the skipped title when completed without connecting", async () => {
    setup({ step: "completed" });

    expect(await screen.findByText("I'll set up AI later")).toBeInTheDocument();
  });

  it("should report a failure to load the providers rather than an empty picker", async () => {
    setup({ providerTypesFail: true });

    expect(
      await screen.findByText("Provider types are unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Anthropic" }),
    ).not.toBeInTheDocument();
  });

  it("should offer a way out when only an unusable connection is listed", async () => {
    setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          type: "anthropic",
          name: "Anthropic",
          usable: false,
        }),
      ],
    });

    expect(
      await screen.findByRole("button", { name: "I'll set this up later" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Anthropic" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
  });
});
