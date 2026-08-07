import type {
  LlmActiveModel,
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
  reorderable: true,
  error: null,
  env_vars: [],
  env_fields: [],
  config: {},
  ...opts,
});

export const createMockLlmActiveModel = (
  opts?: Partial<LlmActiveModel>,
): LlmActiveModel => ({
  model_ref: "anthropic/claude-sonnet-4-6",
  model: "claude-sonnet-4-6",
  connection_key: "anthropic",
  connection_name: "Anthropic",
  selected_model_ref: "anthropic/claude-sonnet-4-6",
  is_fallback: false,
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
