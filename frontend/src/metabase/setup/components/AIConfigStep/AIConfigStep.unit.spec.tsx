import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupMetabaseManagedAiEndpoints,
  setupMetabotSettingsEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import type { SetupStep } from "metabase/redux/store";
import {
  createMockSetupState,
  createMockState,
} from "metabase/redux/store/mocks";
import type {
  EnterpriseSettings,
  SettingDefinition,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIConfigStep } from "./AIConfigStep";

interface SetupOpts {
  step?: SetupStep;
  settings?: Partial<EnterpriseSettings>;
  tokenFeatures?: Partial<TokenFeatures>;
  hasMetabotPlugin?: boolean;
  settingOverrides?: SettingDefinition[];
}

const setup = ({
  step = "ai_config",
  settings = {},
  tokenFeatures = {},
  hasMetabotPlugin = false,
  settingOverrides = [],
}: SetupOpts = {}) => {
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    setup: createMockSetupState({ step, isAiConfigRequested: true }),
    settings: mockSettings({
      ...settings,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasMetabotPlugin) {
    setupEnterpriseOnlyPlugin("metabot");
  }

  // Served through closures so tests can mutate them to simulate the backend
  // state changing after a connect.
  const sessionProperties = createMockSettings({
    ...settings,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const settingDefinitions = [...settingOverrides];

  fetchMock.get("path:/api/setting", () => settingDefinitions);
  setupPropertiesEndpoints(sessionProperties);

  renderWithProviders(<AIConfigStep stepLabel={5} />, {
    storeInitialState: state,
  });

  return { sessionProperties, settingDefinitions };
};

const ANTHROPIC_MODELS = [
  { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
];

const connectAnthropic = async ({
  sessionProperties,
  settingDefinitions,
}: ReturnType<typeof setup>) => {
  setupMetabotSettingsEndpoint({
    provider: "anthropic",
    response: { value: "anthropic/claude-haiku-4-5", models: ANTHROPIC_MODELS },
  });
  fetchMock.put("path:/api/metabot/settings", () => {
    sessionProperties["llm-metabot-provider"] = "anthropic/claude-haiku-4-5";
    sessionProperties["llm-metabot-configured?"] = true;
    settingDefinitions.push(
      createMockSettingDefinition({
        key: "llm-anthropic-api-key",
        value: "**********ey",
      }),
    );
    return { value: "anthropic/claude-haiku-4-5", models: ANTHROPIC_MODELS };
  });

  await userEvent.click(screen.getByLabelText("Provider"));
  await userEvent.click(
    await screen.findByRole("option", { name: "Anthropic" }),
  );
  await userEvent.type(
    screen.getByLabelText("API key"),
    "sk-ant-api03-unit-test-key",
  );
  await userEvent.click(screen.getByRole("button", { name: "Connect" }));
};

describe("AIConfigStep", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should render in inactive state", () => {
    setup({ step: "db_connection" });

    expect(screen.getByText("Connect to an AI provider")).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
  });

  it("should not offer the managed provider without access to it", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Provider"));

    expect(
      await screen.findByRole("option", { name: "Anthropic" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /OpenAI/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Metabase" }),
    ).not.toBeInTheDocument();
  });

  it("should not preselect a provider without access to the managed provider", () => {
    setup();

    expect(screen.getByLabelText("Provider")).toHaveValue("");
  });

  it("should suggest the managed provider when the instance has access to it", async () => {
    setupMetabaseManagedAiEndpoints();
    setup({
      tokenFeatures: { "offer-metabase-ai-managed": true },
      hasMetabotPlugin: true,
    });

    expect(await screen.findByLabelText("Provider")).toHaveValue("Metabase");
    expect(
      await screen.findByText("About Metabase AI service"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
      }),
    ).toBeInTheDocument();
  });

  it("should show the existing connection instead of the managed suggestion when already connected", async () => {
    setupMetabaseManagedAiEndpoints();
    setupMetabotSettingsEndpoint({
      provider: "anthropic",
      response: { value: "anthropic/claude-haiku-4-5", models: [] },
    });
    setup({
      tokenFeatures: { "offer-metabase-ai-managed": true },
      hasMetabotPlugin: true,
      settings: {
        "llm-metabot-configured?": true,
        "llm-metabot-provider": "anthropic/claude-haiku-4-5",
      },
      settingOverrides: [
        createMockSettingDefinition({
          key: "llm-metabot-provider",
          value: "anthropic/claude-haiku-4-5",
        }),
        createMockSettingDefinition({
          key: "llm-anthropic-api-key",
          value: "**********45",
        }),
      ],
    });

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("About Metabase AI service"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "I'll set this up later" }),
    ).not.toBeInTheDocument();
  });

  it("should advance to the next step when skipping", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "I'll set this up later" }),
    );

    expect(await screen.findByText("I'll set up AI later")).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
  });

  it("should show the model picker after connecting a provider", async () => {
    const mocks = setup();

    await connectAnthropic(mocks);

    expect(await screen.findByLabelText("Model")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "I'll set this up later" }),
    ).not.toBeInTheDocument();
  });

  it("should advance to the next step after confirming the connection", async () => {
    const mocks = setup();

    await connectAnthropic(mocks);
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(
      await screen.findByText("Connected to Anthropic"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
  });

  it("should connect the managed provider and advance to the next step", async () => {
    setupMetabaseManagedAiEndpoints();
    fetchMock.post("path:/api/premium-features/token/refresh", 200);

    const { sessionProperties } = setup({
      tokenFeatures: {
        "offer-metabase-ai-managed": true,
        "metabase-ai-managed": true,
      },
      hasMetabotPlugin: true,
    });

    fetchMock.put("path:/api/metabot/settings", () => {
      sessionProperties["llm-metabot-provider"] =
        "metabase/anthropic/claude-sonnet-4-6";
      sessionProperties["llm-metabot-configured?"] = true;
      return { value: "metabase/anthropic/claude-sonnet-4-6", models: [] };
    });

    expect(
      await screen.findByText("About Metabase AI service"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByText("Connected to Metabase"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/metabot/settings", {
        method: "PUT",
        body: { provider: "metabase", model: "" },
      }),
    ).toBe(true);
  });

  it("should show the connected provider when completed after connecting", () => {
    setup({
      step: "completed",
      settings: {
        "llm-metabot-configured?": true,
        "llm-metabot-provider": "anthropic/claude-haiku-4-5",
      },
    });

    expect(screen.getByText("Connected to Anthropic")).toBeInTheDocument();
  });

  it("should show the skipped title when completed without connecting", () => {
    setup({ step: "completed" });

    expect(screen.getByText("I'll set up AI later")).toBeInTheDocument();
  });
});
