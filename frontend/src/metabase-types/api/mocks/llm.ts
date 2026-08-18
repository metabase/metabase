import type {
  LlmConnectionModels,
  LlmModel,
  LlmProviderConnection,
  LlmProviderField,
  LlmProviderType,
} from "../llm";

export const createMockLlmProviderField = (
  opts?: Partial<LlmProviderField>,
): LlmProviderField => ({
  key: "api-key",
  label: "API key",
  type: "password",
  required: true,
  advanced: false,
  ...opts,
});

export const createMockLlmProviderType = (
  opts?: Partial<LlmProviderType>,
): LlmProviderType => ({
  type: "anthropic",
  label: "Anthropic",
  managed: false,
  singleton: false,
  available: true,
  default_model: null,
  models: [],
  required_any: [],
  fields: [createMockLlmProviderField()],
  ...opts,
});

export const createMockLlmProviderConnection = (
  opts?: Partial<LlmProviderConnection>,
): LlmProviderConnection => ({
  key: "anthropic",
  type: "anthropic",
  name: "Anthropic",
  source: "db",
  usable: true,
  env_vars: [],
  env_fields: [],
  config: {},
  ...opts,
});

export const createMockLlmModel = (opts?: Partial<LlmModel>): LlmModel => ({
  id: "claude-sonnet-4-5",
  display_name: "Claude Sonnet 4.5",
  ...opts,
});

export const createMockLlmConnectionModels = (
  opts?: Partial<LlmConnectionModels>,
): LlmConnectionModels => ({
  key: "anthropic",
  name: "Anthropic",
  type: "anthropic",
  models: [createMockLlmModel()],
  ...opts,
});
