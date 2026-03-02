import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";

import { setup } from "./MetabotSQLGenerationSettingsSection.setup";

const apiKeyInput = () => screen.findByLabelText(/Anthropic API Key/i);
const modelSelect = () => screen.findByLabelText(/Model/i);

function getSettingPutCalls(settingKey?: string) {
  return fetchMock.callHistory
    .calls()
    .filter(
      (call) =>
        call.request?.method === "PUT" &&
        call.request?.url?.includes(settingKey ?? "/api/setting/"),
    );
}

const DEFAULT_MODELS = [
  { id: "claude-opus-4-5-20251101", display_name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-20250514", display_name: "Claude Sonnet 4" },
  { id: "claude-haiku-4-20250414", display_name: "Claude Haiku 4" },
];

describe("MetabotSQLGenerationSettingsSection", () => {
  describe("initial rendering", () => {
    it("should render API key and model fields", async () => {
      await setup({ models: DEFAULT_MODELS });
      expect(await apiKeyInput()).toBeInTheDocument();
      expect(await modelSelect()).toBeInTheDocument();
    });

    it("should show error state when settings fail to load", async () => {
      await setup({ settingsError: true });
      expect(await screen.findByText(/error/i)).toBeInTheDocument();
    });
  });

  describe("API key field", () => {
    it("should display saved API key value", async () => {
      await setup({ apiKey: "sk-ant-test-key-12345" });
      expect(await apiKeyInput()).toHaveValue("sk-ant-test-key-12345");
    });

    it("should save API key on blur when value has changed", async () => {
      await setup({ apiKey: "" });

      await userEvent.type(await apiKeyInput(), "sk-ant-new-key");
      await userEvent.tab();

      await waitFor(() => {
        expect(getSettingPutCalls().length).toBeGreaterThan(0);
      });

      expect(getSettingPutCalls().at(-1)?.request?.url).toContain(
        "llm-anthropic-api-key",
      );
    });

    it("should not save API key on blur when value is unchanged", async () => {
      await setup({ apiKey: "existing-key" });

      await userEvent.click(await apiKeyInput());
      await userEvent.tab();

      await waitFor(() => {
        expect(getSettingPutCalls("llm-anthropic-api-key").length).toBe(0);
      });
    });

    it("should show env var indicator and disable input when API key is set via environment variable", async () => {
      await setup({ apiKey: "env-api-key", isApiKeyEnvVar: true });

      expect(
        await screen.findByText(/MB_LLM_ANTHROPIC_API_KEY/),
      ).toBeInTheDocument();
      expect(await apiKeyInput()).toBeDisabled();
    });
  });

  describe("model select field", () => {
    it("should be disabled when no API key is configured", async () => {
      await setup({ apiKey: null, models: DEFAULT_MODELS });
      expect(await modelSelect()).toBeDisabled();
    });

    it("should fetch and display available models when API key exists", async () => {
      await setup({ apiKey: "sk-ant-key", models: DEFAULT_MODELS });

      await waitFor(async () => expect(await modelSelect()).toBeEnabled());
      await userEvent.click(await modelSelect());

      expect(await screen.findByText("Claude Opus 4.5")).toBeInTheDocument();
      expect(await screen.findByText("Claude Sonnet 4")).toBeInTheDocument();
      expect(await screen.findByText("Claude Haiku 4")).toBeInTheDocument();
    });

    it("should show error message when model fetch fails", async () => {
      await setup({ apiKey: "sk-ant-key", modelsError: true });
      expect(
        await screen.findByText(/Failed to load models/i),
      ).toBeInTheDocument();
    });

    it("should show deprecation warning when saved model is not in available list", async () => {
      await setup({
        apiKey: "sk-ant-key",
        model: "claude-2-deprecated",
        models: DEFAULT_MODELS,
      });
      expect(
        await screen.findByText(/no longer available/i),
      ).toBeInTheDocument();
    });

    it("should show env var indicator and disable select when model is set via environment variable", async () => {
      await setup({
        apiKey: "sk-ant-key",
        model: "claude-sonnet-4-20250514",
        isModelEnvVar: true,
        models: DEFAULT_MODELS,
      });

      expect(
        await screen.findByText(/MB_LLM_ANTHROPIC_MODEL/),
      ).toBeInTheDocument();
      expect(await modelSelect()).toBeDisabled();
    });
  });
});
