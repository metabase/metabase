import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { setupLlmModelsEndpoint } from "__support__/server-mocks/metabot";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { LlmConnectionModels } from "metabase-types/api";
import {
  createMockLlmConnectionModels,
  createMockLlmModel,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIModelSettingsSection } from "./AIModelSettingsSection";

const CONNECTION_MODELS = [
  createMockLlmConnectionModels({
    key: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    models: [
      createMockLlmModel({
        id: "claude-opus-5",
        display_name: "Claude Opus 5",
      }),
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
  models?: LlmConnectionModels[];
  metabotModel?: string | null;
  metabotModelEnvVar?: string;
  miniModel?: string | null;
  supportsFastMode?: boolean;
};

function renderSection({
  models = CONNECTION_MODELS,
  metabotModel = "anthropic/claude-sonnet-4-5",
  metabotModelEnvVar,
  miniModel = "anthropic/claude-haiku-4-5",
  supportsFastMode = false,
}: SetupOpts = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const sessionProperties = createMockSettings({
    "llm-metabot-provider": metabotModel,
    "llm-mini-model": miniModel,
    "llm-metabot-supports-fast-mode?": supportsFastMode,
  });

  setupPropertiesEndpoints(sessionProperties);
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "llm-metabot-provider",
      value: metabotModel,
      is_env_setting: metabotModelEnvVar != null,
      env_name: metabotModelEnvVar,
    }),
    createMockSettingDefinition({ key: "llm-mini-model", value: miniModel }),
    createMockSettingDefinition({ key: "llm-fast-mode", value: false }),
  ]);
  setupUpdateSettingEndpoint();
  setupLlmModelsEndpoint(models);

  renderWithProviders(
    <>
      <AIModelSettingsSection />
      <UndoListing />
    </>,
    {
      storeInitialState: {
        settings: mockSettings(sessionProperties),
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

async function setup(opts: SetupOpts = {}) {
  renderSection(opts);

  await screen.findByText("Models");
  await waitFor(() =>
    expect(screen.getByLabelText("Default model")).not.toHaveValue(""),
  );
}

async function openPicker(label: string) {
  await userEvent.click(screen.getByLabelText(label));
  return await screen.findByRole("listbox");
}

describe("AIModelSettingsSection", () => {
  it("stays on screen while the models are still loading", () => {
    renderSection();

    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByLabelText("Default model")).toBeDisabled();
    expect(screen.getByLabelText("Mini model")).toBeDisabled();
    expect(screen.getAllByPlaceholderText("Loading models...")).toHaveLength(2);
  });

  it("shows the model each use case runs on", async () => {
    await setup();

    expect(screen.getByLabelText("Default model")).toHaveValue(
      "Anthropic · Claude Sonnet 4.5",
    );
    expect(screen.getByLabelText("Mini model")).toHaveValue(
      "Anthropic · Claude Haiku 4.5",
    );
  });

  it("lists models grouped by connection and saves the picked default", async () => {
    await setup();

    const listbox = await openPicker("Default model");

    expect(within(listbox).getByText("Anthropic")).toBeInTheDocument();
    expect(within(listbox).getByText("Azure prod")).toBeInTheDocument();

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

    expect(await screen.findAllByText("Changes saved")).toHaveLength(1);
  });

  it("surfaces a failure to save the picked model", async () => {
    await setup();

    fetchMock.modifyRoute("update-setting", {
      response: { status: 400, body: { message: "Unsupported model" } },
    });

    const listbox = await openPicker("Default model");
    await userEvent.click(
      within(listbox).getByRole("option", { name: "GPT-5" }),
    );

    expect(await screen.findByText("Unsupported model")).toBeInTheDocument();
    expect(screen.queryByText("Changes saved")).not.toBeInTheDocument();
  });

  it("locks the model picker and names the env var when the model is set by one", async () => {
    await setup({ metabotModelEnvVar: "MB_LLM_METABOT_PROVIDER" });

    expect(
      await screen.findByTestId("setting-env-var-message"),
    ).toHaveTextContent("MB_LLM_METABOT_PROVIDER");
    expect(screen.getByLabelText("Default model")).toBeDisabled();
  });

  it("saves the mini model separately from the default model", async () => {
    await setup();

    const listbox = await openPicker("Mini model");

    await userEvent.click(
      within(listbox).getByRole("option", { name: "GPT-5" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/setting/llm-mini-model", {
          method: "PUT",
          body: { value: "azure-prod/gpt-5" },
        }),
      ).toBe(true);
    });

    expect(
      fetchMock.callHistory.called("path:/api/setting/llm-metabot-provider", {
        method: "PUT",
      }),
    ).toBe(false);
  });

  it("hides fast mode when the selected model doesn't support it", async () => {
    await setup();

    expect(screen.queryByText("Fast mode")).not.toBeInTheDocument();
  });

  it("offers fast mode when the selected model supports it and saves the toggle", async () => {
    await setup({
      metabotModel: "anthropic/claude-opus-5",
      supportsFastMode: true,
    });

    await userEvent.click(await screen.findByText("Fast mode"));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/setting/llm-fast-mode", {
          method: "PUT",
          body: { value: true },
        }),
      ).toBe(true);
    });
  });

  it("hides fast mode after switching to a model without it", async () => {
    await setup({
      metabotModel: "anthropic/claude-opus-5",
      supportsFastMode: true,
    });

    expect(await screen.findByText("Fast mode")).toBeInTheDocument();

    setupPropertiesEndpoints(
      createMockSettings({
        "llm-metabot-provider": "azure-prod/gpt-5",
        "llm-mini-model": "anthropic/claude-haiku-4-5",
        "llm-metabot-supports-fast-mode?": false,
      }),
    );
    const listbox = await openPicker("Default model");
    await userEvent.click(
      within(listbox).getByRole("option", { name: "GPT-5" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Fast mode")).not.toBeInTheDocument();
    });
  });
});
