import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupMetabaseManagedAiEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import type { SetupStep } from "metabase/redux/store";
import {
  createMockSetupState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { EnterpriseSettings, TokenFeatures } from "metabase-types/api";
import {
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
}

const setup = ({
  step = "ai_config",
  settings = {},
  tokenFeatures = {},
  hasMetabotPlugin = false,
}: SetupOpts = {}) => {
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    setup: createMockSetupState({ step }),
    settings: mockSettings({
      ...settings,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasMetabotPlugin) {
    setupEnterpriseOnlyPlugin("metabot");
  }

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(createMockSettings());

  renderWithProviders(<AIConfigStep stepLabel={4} />, {
    storeInitialState: state,
  });
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

    expect(screen.getByLabelText("Provider")).toHaveValue("Metabase");
    expect(
      await screen.findByText("About Metabase AI service"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
      }),
    ).toBeInTheDocument();
  });

  it("should advance to the next step when skipping", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "I'll set this up later" }),
    );

    expect(await screen.findByText("I'll set up AI later")).toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
  });

  it("should show the connected provider when completed after connecting", () => {
    setup({
      step: "data_usage",
      settings: {
        "llm-metabot-configured?": true,
        "llm-metabot-provider": "anthropic/claude-haiku-4-5",
      },
    });

    expect(screen.getByText("Connected to Anthropic")).toBeInTheDocument();
  });

  it("should show the skipped title when completed without connecting", () => {
    setup({ step: "data_usage" });

    expect(screen.getByText("I'll set up AI later")).toBeInTheDocument();
  });
});
