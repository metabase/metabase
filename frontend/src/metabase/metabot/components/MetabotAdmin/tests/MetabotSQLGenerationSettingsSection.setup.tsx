import fetchMock from "fetch-mock";

import {
  setupLlmListModelsEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import type { LLMModel } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { MetabotSQLGenerationSettingsSection } from "../MetabotSQLGenerationSettingsSection";

export interface SetupOptions {
  apiKey?: string | null;
  model?: string;
  isApiKeyEnvVar?: boolean;
  isModelEnvVar?: boolean;
  models?: LLMModel[];
  modelsError?: boolean;
  settingsError?: boolean;
}

export async function setup({
  apiKey = null,
  model = "",
  isApiKeyEnvVar = false,
  isModelEnvVar = false,
  models = [],
  modelsError = false,
  settingsError = false,
}: SetupOptions = {}) {
  if (settingsError) {
    fetchMock.get("path:/api/session/properties", 500);
    fetchMock.get("path:/api/setting", 500);
  } else {
    setupPropertiesEndpoints(
      createMockSettings({
        "llm-anthropic-api-key": apiKey,
        "llm-anthropic-model": model,
      }),
    );
    setupSettingsEndpoints([
      createMockSettingDefinition({
        key: "llm-anthropic-api-key",
        value: apiKey,
        is_env_setting: isApiKeyEnvVar,
        env_name: isApiKeyEnvVar ? "MB_LLM_ANTHROPIC_API_KEY" : "",
      }),
      createMockSettingDefinition({
        key: "llm-anthropic-model",
        value: model,
        is_env_setting: isModelEnvVar,
        env_name: isModelEnvVar ? "MB_LLM_ANTHROPIC_MODEL" : "",
      }),
    ]);
  }

  setupUpdateSettingEndpoint();
  setupLlmListModelsEndpoint(models, modelsError);

  renderWithProviders(<MetabotSQLGenerationSettingsSection />);
}
