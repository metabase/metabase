import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  setupCreateLlmProviderEndpoint,
  setupDeleteLlmProviderEndpoint,
  setupLlmActiveModelEndpoint,
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupReorderLlmProvidersEndpoint,
  setupUpdateLlmProviderEndpoint,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { AIProviderSetup } from "metabase/metabot";
import { reinitialize } from "metabase/plugins";
import type {
  LlmActiveModels,
  LlmConnectionModels,
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";
import {
  createMockLlmActiveModels,
  createMockLlmConnectionModels,
  createMockLlmModel,
  createMockLlmProviderConnection,
  createMockLlmProviderField,
  createMockLlmProviderType,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIProviderSettingsSection } from "./AIProviderSettingsSection";

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
    createMockLlmProviderField({
      key: "base-url",
      label: "API base URL",
      type: "text",
      required: false,
      advanced: true,
      default: "https://api.anthropic.com",
    }),
  ],
});

const AZURE_TYPE = createMockLlmProviderType({
  type: "azure",
  label: "Azure",
  fields: [
    createMockLlmProviderField({
      key: "api-key",
      label: "API key",
      type: "password",
      required: true,
    }),
    createMockLlmProviderField({
      key: "api-base-url",
      label: "Base URL",
      type: "text",
      required: true,
    }),
    createMockLlmProviderField({
      key: "model-family",
      label: "Model provider",
      type: "select",
      required: true,
      default: "openai",
      options: [
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic" },
      ],
    }),
    createMockLlmProviderField({
      key: "deployment-name",
      label: "Deployment name",
      type: "text",
      required: true,
    }),
  ],
});

const BEDROCK_TYPE = createMockLlmProviderType({
  type: "bedrock",
  label: "Amazon Bedrock",
  fields: [
    createMockLlmProviderField({
      key: "access-key-id",
      label: "Access key ID",
      type: "password",
      required: true,
    }),
    createMockLlmProviderField({
      key: "secret-access-key",
      label: "Secret access key",
      type: "password",
      required: true,
    }),
    createMockLlmProviderField({
      key: "region",
      label: "Region",
      type: "select",
      required: false,
      advanced: false,
      default: "us-east-1",
      options: [
        { value: "us-east-1", label: "us-east-1" },
        { value: "eu-central-1", label: "eu-central-1" },
      ],
    }),
    createMockLlmProviderField({
      key: "session-token",
      label: "Session token",
      type: "password",
      required: false,
      advanced: true,
    }),
  ],
});

const ANTHROPIC_CONNECTION = createMockLlmProviderConnection({
  key: "anthropic",
  type: "anthropic",
  name: "Anthropic",
  config: { "api-key": "sk-ant-saved" },
});

const AZURE_CONNECTION = createMockLlmProviderConnection({
  key: "azure-prod",
  type: "azure",
  name: "Azure prod",
  config: { "api-key": "azure-saved", "api-base-url": "https://azure.test" },
});

const CONNECTION_MODELS = [
  createMockLlmConnectionModels({
    key: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    models: [
      createMockLlmModel({
        id: "claude-sonnet-4-5",
        display_name: "Claude Sonnet 4.5",
      }),
      createMockLlmModel({
        id: "claude-haiku-4-5",
        display_name: "Claude Haiku 4.5",
      }),
    ],
  }),
  createMockLlmConnectionModels({
    key: "azure-prod",
    name: "Azure prod",
    type: "azure",
    models: [createMockLlmModel({ id: "gpt-5", display_name: "GPT-5" })],
  }),
];

type SetupOpts = {
  connections?: LlmProviderConnection[];
  providerTypes?: LlmProviderType[];
  models?: LlmConnectionModels[];
  modelRef?: string | null;
  modelRefEnvVar?: string;
  providerTypesFail?: boolean;
  createdConnection?: LlmProviderConnection;
  updatedConnection?: LlmProviderConnection;
  activeModels?: LlmActiveModels;
};

async function setup({
  connections = [],
  providerTypes = [ANTHROPIC_TYPE, AZURE_TYPE, BEDROCK_TYPE],
  models = [],
  modelRef = null,
  modelRefEnvVar,
  providerTypesFail = false,
  createdConnection = ANTHROPIC_CONNECTION,
  updatedConnection = ANTHROPIC_CONNECTION,
  activeModels = createMockLlmActiveModels(),
}: SetupOpts = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings({
    "llm-metabot-provider": modelRef,
  });

  setupPropertiesEndpoints(sessionProperties);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "llm-metabot-provider",
      value: modelRef,
      is_env_setting: modelRefEnvVar != null,
      env_name: modelRefEnvVar,
    }),
  ]);
  setupUpdateSettingEndpoint();
  if (providerTypesFail) {
    fetchMock.get("path:/api/llm/provider-types", {
      status: 500,
      body: { message: "Provider types are unavailable" },
    });
  } else {
    setupLlmProviderTypesEndpoint(providerTypes);
  }
  setupLlmProvidersEndpoint(connections);
  setupLlmModelsEndpoint(models);
  setupLlmActiveModelEndpoint(activeModels);
  setupReorderLlmProvidersEndpoint(connections);
  setupCreateLlmProviderEndpoint(createdConnection);
  setupUpdateLlmProviderEndpoint(updatedConnection);
  setupDeleteLlmProviderEndpoint();

  const view = renderWithProviders(
    <>
      <AIProviderSettingsSection />
      <UndoListing />
    </>,
    {
      storeInitialState: {
        settings: mockSettings(sessionProperties),
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );

  if (providerTypesFail) {
    await screen.findByText(/Provider types are unavailable/);
  } else if (connections.length > 0) {
    await screen.findByText(connections[0].name);
  } else {
    await screen.findByRole("button", { name: /Add a provider/ });
  }

  return view;
}

async function openAddProviderModal() {
  await userEvent.click(screen.getByRole("button", { name: /Add a provider/ }));
  return await screen.findByRole("dialog");
}

async function selectOption(name: string) {
  await userEvent.click(await screen.findByRole("option", { name }));
}

async function openProviderMenu() {
  await userEvent.click(
    screen.getByRole("button", { name: "Provider options" }),
  );
}

async function openAdvancedSettings(modal: HTMLElement) {
  await userEvent.click(
    within(modal).getByRole("button", { name: /Advanced settings/ }),
  );
}

describe("AIProviderSettingsSection", () => {
  afterEach(() => {
    reinitialize();
  });

  it("reports a failure to load the providers instead of an empty list", async () => {
    await setup({ providerTypesFail: true });

    expect(
      screen.getByText("Provider types are unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add a provider/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing is connected", async () => {
    await setup();

    expect(screen.getByText("Connect to an AI provider")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Select your AI provider to use AI explorations, SQL generation and Metabot.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add a provider/ }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("lists the configured connections", async () => {
    await setup({
      connections: [ANTHROPIC_CONNECTION, AZURE_CONNECTION],
      models: CONNECTION_MODELS,
    });

    expect(screen.getByText("AI providers")).toBeInTheDocument();
    expect(
      screen.getByText("Metabot can use models from any of these providers."),
    ).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Azure prod")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add another provider/ }),
    ).toBeInTheDocument();
  });

  it("picks the provider and fills the key in when one is pasted", async () => {
    await setup();

    const modal = await openAddProviderModal();
    expect(
      within(modal).queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();

    await userEvent.paste("sk-ant-api03-pasted");

    const apiKey = await within(modal).findByLabelText(/API key/);
    expect(apiKey).toHaveValue("sk-ant-api03-pasted");
    expect(within(modal).getByText("Anthropic")).toBeInTheDocument();
    expect(
      within(modal).getByRole("button", { name: "Connect" }),
    ).toBeEnabled();

    await userEvent.click(
      within(modal).getByRole("button", { name: "Connect" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/llm/providers", {
          method: "POST",
          body: {
            type: "anthropic",
            name: "Anthropic",
            config: { "api-key": "sk-ant-api03-pasted" },
          },
        }),
      ).toBe(true);
    });
  });

  it("stays on the picker when the pasted text is not a recognizable key", async () => {
    await setup();

    const modal = await openAddProviderModal();
    await userEvent.paste("just some text");

    expect(within(modal).queryByLabelText(/API key/)).not.toBeInTheDocument();
    expect(
      within(modal).getByRole("button", { name: "Anthropic" }),
    ).toBeInTheDocument();
  });

  it("adds a provider through the modal", async () => {
    await setup();

    const modal = await openAddProviderModal();

    expect(
      within(modal).queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();
    expect(
      within(modal).getByRole("button", { name: /Anthropic/ }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(modal).getByRole("button", { name: "Anthropic" }),
    );

    await openAdvancedSettings(modal);
    expect(within(modal).getByLabelText("Display name")).toHaveValue(
      "Anthropic",
    );
    expect(
      within(modal).getByRole("button", { name: "Connect" }),
    ).toBeDisabled();

    await userEvent.type(within(modal).getByLabelText(/API key/), "sk-ant-new");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Connect" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/llm/providers", {
          method: "POST",
          body: {
            type: "anthropic",
            name: "Anthropic",
            config: { "api-key": "sk-ant-new" },
          },
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("offers the Azure deployment as two fields rather than a hand-typed prefix", async () => {
    await setup();

    const modal = await openAddProviderModal();
    await userEvent.click(within(modal).getByRole("button", { name: "Azure" }));

    expect(within(modal).getByLabelText("Model provider")).toBeVisible();
    expect(within(modal).getByLabelText("Model provider")).toHaveValue(
      "OpenAI",
    );
    expect(within(modal).getByLabelText(/Deployment name/)).toBeVisible();

    await userEvent.type(within(modal).getByLabelText(/API key/), "azure-new");
    await userEvent.type(
      within(modal).getByLabelText(/Base URL/),
      "https://azure.test",
    );
    await userEvent.type(
      within(modal).getByLabelText(/Deployment name/),
      "gpt-4.1-mini",
    );

    // the pre-selected model provider counts as filled in, so it does not block Connect
    expect(
      within(modal).getByRole("button", { name: "Connect" }),
    ).toBeEnabled();
  });

  it("submits every descriptor field the provider type declares", async () => {
    await setup({ createdConnection: AZURE_CONNECTION });

    const modal = await openAddProviderModal();

    await userEvent.click(within(modal).getByRole("button", { name: "Azure" }));

    await userEvent.type(within(modal).getByLabelText(/API key/), "azure-new");
    await userEvent.type(
      within(modal).getByLabelText(/Base URL/),
      "https://azure.test",
    );

    await userEvent.type(
      within(modal).getByLabelText(/Deployment name/),
      "my-deployment",
    );
    await userEvent.click(within(modal).getByLabelText("Model provider"));
    await selectOption("Anthropic");

    await userEvent.click(
      within(modal).getByRole("button", { name: "Connect" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/llm/providers", {
          method: "POST",
          body: {
            type: "azure",
            name: "Azure",
            config: {
              "api-key": "azure-new",
              "api-base-url": "https://azure.test",
              "deployment-name": "my-deployment",
              "model-family": "anthropic",
            },
          },
        }),
      ).toBe(true);
    });
  });

  it("returns to provider selection from the configuration step", async () => {
    await setup();

    const modal = await openAddProviderModal();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Anthropic" }),
    );

    expect(within(modal).getByLabelText(/API key/)).toBeInTheDocument();

    await userEvent.click(within(modal).getByRole("button", { name: "Back" }));

    expect(
      within(modal).getByRole("button", { name: /Anthropic/ }),
    ).toBeInTheDocument();
    expect(within(modal).queryByLabelText(/API key/)).not.toBeInTheDocument();
  });

  it("keeps the optional fields behind advanced settings", async () => {
    await setup();

    const modal = await openAddProviderModal();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Anthropic" }),
    );

    expect(within(modal).getByLabelText(/API key/)).toBeVisible();
    expect(within(modal).getByLabelText("Display name")).not.toBeVisible();
    expect(within(modal).getByLabelText("API base URL")).not.toBeVisible();

    await openAdvancedSettings(modal);

    await waitFor(() =>
      expect(within(modal).getByLabelText("Display name")).toBeVisible(),
    );
    expect(within(modal).getByLabelText("API base URL")).toBeVisible();
  });

  it("keeps an optional field up front unless it is marked advanced", async () => {
    await setup();

    const modal = await openAddProviderModal();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Amazon Bedrock" }),
    );

    expect(within(modal).getByLabelText(/Access key ID/)).toBeVisible();
    expect(within(modal).getByLabelText(/Secret access key/)).toBeVisible();
    expect(within(modal).getByLabelText("Region")).toBeVisible();
    expect(within(modal).getByLabelText("Session token")).not.toBeVisible();
  });

  it("opens advanced settings for a connection that already customized one", async () => {
    await setup({
      connections: [
        createMockLlmProviderConnection({
          key: "anthropic",
          type: "anthropic",
          name: "Anthropic",
          config: {
            "api-key": "sk-ant-saved",
            "base-url": "https://proxy.internal",
          },
        }),
      ],
      models: CONNECTION_MODELS,
    });

    await openProviderMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Edit/ }),
    );

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByLabelText("API base URL")).toBeVisible();
    expect(within(modal).getByLabelText("API base URL")).toHaveValue(
      "https://proxy.internal",
    );
  });

  it("edits an existing connection", async () => {
    await setup({
      connections: [ANTHROPIC_CONNECTION],
      models: CONNECTION_MODELS,
    });

    await openProviderMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Edit/ }),
    );

    const modal = await screen.findByRole("dialog");
    expect(within(modal).queryByLabelText("Provider")).not.toBeInTheDocument();

    await openAdvancedSettings(modal);
    const displayName = within(modal).getByLabelText("Display name");
    await userEvent.clear(displayName);
    await userEvent.type(displayName, "Anthropic prod");

    await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/llm/providers/anthropic", {
          method: "PUT",
          body: {
            name: "Anthropic prod",
            config: { "api-key": "sk-ant-saved" },
          },
        }),
      ).toBe(true);
    });
  });

  it("removes a connection after confirming", async () => {
    await setup({
      connections: [ANTHROPIC_CONNECTION],
      models: CONNECTION_MODELS,
    });

    await openProviderMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Remove/ }),
    );

    expect(
      await screen.findByText("Remove this provider?"),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/llm/providers/anthropic", {
        method: "DELETE",
      }),
    ).toBe(false);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove provider" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/llm/providers/anthropic", {
          method: "DELETE",
        }),
      ).toBe(true);
    });
  });

  it("renders an env-backed connection as read-only", async () => {
    await setup({
      connections: [
        createMockLlmProviderConnection({
          key: "openai",
          type: "openai",
          name: "OpenAI",
          source: "env",
          env_vars: ["MB_LLM_OPENAI_API_KEY"],
        }),
      ],
    });

    expect(
      screen.getByText("MB_LLM_OPENAI_API_KEY", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Provider options" }),
    ).not.toBeInTheDocument();
  });
});

describe("AIProviderSetup (ad-hoc connect modal)", () => {
  afterEach(() => {
    reinitialize();
  });

  async function setupModal() {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();

    const sessionProperties = createMockSettings({
      "llm-metabot-provider": null,
    });

    setupPropertiesEndpoints(sessionProperties);
    setupSettingsEndpoints([
      createMockSettingDefinition({ key: "llm-metabot-provider", value: null }),
    ]);
    setupUpdateSettingEndpoint();
    setupLlmProviderTypesEndpoint([ANTHROPIC_TYPE]);
    setupLlmProvidersEndpoint([]);
    setupLlmModelsEndpoint(CONNECTION_MODELS);
    setupLlmActiveModelEndpoint();
    setupCreateLlmProviderEndpoint(ANTHROPIC_CONNECTION);

    const onDone = jest.fn();
    renderWithProviders(<AIProviderSetup onDone={onDone} />, {
      storeInitialState: {
        settings: mockSettings(sessionProperties),
        currentUser: createMockUser({ is_superuser: true }),
      },
    });

    return { onDone };
  }

  it("shows the model picker after connecting rather than closing", async () => {
    const { onDone } = await setupModal();

    await userEvent.click(
      await screen.findByRole("button", { name: "Anthropic" }),
    );
    await userEvent.type(screen.getByLabelText(/API key/), "sk-ant-test");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByLabelText("Model")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("starts with provider selection and does not offer a provider list action", async () => {
    await setupModal();

    expect(
      screen.queryByRole("button", { name: /Add a provider/ }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Anthropic" }),
    ).toBeInTheDocument();
  });
});
