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
  setupLlmModelsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupUpdateLlmProviderEndpoint,
} from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { AIProviderConfigurationForm } from "metabase/metabot";
import { reinitialize } from "metabase/plugins";
import type {
  LlmConnectionModels,
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";
import {
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
      label: "Model family",
      type: "select",
      required: false,
      options: [
        { value: "claude", label: "Claude models" },
        { value: "gpt", label: "GPT models" },
      ],
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
  createdConnection?: LlmProviderConnection;
  updatedConnection?: LlmProviderConnection;
};

async function setup({
  connections = [],
  providerTypes = [ANTHROPIC_TYPE, AZURE_TYPE],
  models = [],
  modelRef = null,
  createdConnection = ANTHROPIC_CONNECTION,
  updatedConnection = ANTHROPIC_CONNECTION,
}: SetupOpts = {}) {
  const sessionProperties = createMockSettings({
    "llm-metabot-provider": modelRef,
  });

  setupPropertiesEndpoints(sessionProperties);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "llm-metabot-provider",
      value: modelRef,
    }),
  ]);
  setupUpdateSettingEndpoint();
  setupLlmProviderTypesEndpoint(providerTypes);
  setupLlmProvidersEndpoint(connections);
  setupLlmModelsEndpoint(models);
  setupCreateLlmProviderEndpoint(createdConnection);
  setupUpdateLlmProviderEndpoint(updatedConnection);
  setupDeleteLlmProviderEndpoint();

  const view = renderWithProviders(<AIProviderSettingsSection />, {
    storeInitialState: {
      settings: mockSettings(sessionProperties),
      currentUser: createMockUser({ is_superuser: true }),
    },
  });

  if (connections.length > 0) {
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

async function openModelPicker() {
  await userEvent.click(screen.getByLabelText("Model"));
  return await screen.findByRole("listbox");
}

const SETTING_PATH = "/api/setting";

async function findPutRequests() {
  const requests = await findRequests("PUT");
  return requests.map(({ url, body }) => ({
    path: new URL(url, location.origin).pathname,
    body,
  }));
}

async function findPutBodies(path: string) {
  return (await findPutRequests())
    .filter((request) => request.path === path)
    .map(({ body }) => body);
}

const findSettingUpdates = () => findPutBodies(SETTING_PATH);

describe("AIProviderSettingsSection", () => {
  afterEach(() => {
    reinitialize();
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
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
  });

  it("adds a provider through the modal", async () => {
    await setup();

    const modal = await openAddProviderModal();

    expect(
      within(modal).queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(modal).getByLabelText("Provider"));
    await selectOption("Anthropic");

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

  it("submits every descriptor field the provider type declares", async () => {
    await setup({ createdConnection: AZURE_CONNECTION });

    const modal = await openAddProviderModal();

    await userEvent.click(within(modal).getByLabelText("Provider"));
    await selectOption("Azure");

    await userEvent.type(within(modal).getByLabelText(/API key/), "azure-new");
    await userEvent.type(
      within(modal).getByLabelText(/Base URL/),
      "https://azure.test",
    );
    await userEvent.click(within(modal).getByLabelText("Model family"));
    await selectOption("Claude models");

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
              "model-family": "claude",
            },
          },
        }),
      ).toBe(true);
    });
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
        }),
      ],
    });

    expect(
      screen.getByText("Set by environment variables"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Provider options" }),
    ).not.toBeInTheDocument();
  });

  it("lists models grouped by connection and saves the picked one", async () => {
    await setup({
      connections: [ANTHROPIC_CONNECTION, AZURE_CONNECTION],
      models: CONNECTION_MODELS,
      modelRef: "anthropic/claude-sonnet-4-5",
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Model")).toHaveValue("Claude Sonnet 4.5"),
    );

    const listbox = await openModelPicker();

    expect(within(listbox).getByText("Anthropic")).toBeInTheDocument();
    expect(within(listbox).getByText("Azure prod")).toBeInTheDocument();
    expect(
      within(listbox).getByRole("option", { name: "Claude Haiku 4.5" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(listbox).getByRole("option", { name: "GPT-5" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/setting/llm-metabot-provider", {
          method: "PUT",
          body: { value: "azure-prod/gpt-5" },
        }),
      ).toBe(true);
    });
  });
});

describe("AIProviderConfigurationForm (ad-hoc connect modal)", () => {
  afterEach(() => {
    reinitialize();
  });

  async function setupModal() {
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
    setupCreateLlmProviderEndpoint(ANTHROPIC_CONNECTION);

    const onClose = jest.fn();
    renderWithProviders(
      <AIProviderConfigurationForm isModal onClose={onClose} />,
      {
        storeInitialState: {
          settings: mockSettings(sessionProperties),
          currentUser: createMockUser({ is_superuser: true }),
        },
      },
    );

    return { onClose };
  }

  it("shows the model picker after connecting rather than closing", async () => {
    const { onClose } = await setupModal();

    await userEvent.click(await screen.findByLabelText("Provider"));
    await selectOption("Anthropic");
    await userEvent.type(screen.getByLabelText(/API key/), "sk-ant-test");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByLabelText("Model")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not offer a way to add a second provider", async () => {
    await setupModal();

    expect(
      screen.queryByRole("button", { name: /Add a provider/ }),
    ).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Provider")).toBeInTheDocument();
  });
});
