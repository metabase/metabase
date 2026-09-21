import type { DatabaseId } from "./database";
import type { TemplateTags } from "./dataset";

export interface ExtractSourcesRequest {
  database_id: DatabaseId;
  sql: string;
  template_tags?: TemplateTags;
}

export interface ExtractSourcesColumn {
  id: number;
  name: string;
  database_type?: string | null;
  description?: string | null;
  semantic_type?: string | null;
  fk_target?: {
    table_name: string;
    field_name: string;
  };
}

export interface ExtractSourcesTable {
  id: number;
  name: string;
  schema?: string | null;
  display_name?: string | null;
  description?: string | null;
  columns: ExtractSourcesColumn[];
}

export interface ExtractSourcesResponse {
  tables: ExtractSourcesTable[];
  card_ids: number[];
}

export type LlmProviderTypeName =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "mistral"
  | "zai"
  | "moonshot"
  | "deepseek"
  | "google"
  | "azure"
  | "bedrock"
  | "vllm"
  | "metabase";

export type LlmProviderFieldType =
  | "text"
  | "password"
  | "select"
  | "segmented"
  | "file";

export interface LlmProviderField {
  key: string;
  label: string;
  type: LlmProviderFieldType;
  required: boolean;
  advanced: boolean;
  placeholder?: string | null;
  default?: string | null;
  help?: string | null;
  docs_url?: string | null;
  prefix?: string | null;
  options?: { value: string; label: string }[] | null;
  show_when?: { field: string; value: string } | null;
}

export interface LlmProviderType {
  type: LlmProviderTypeName;
  label: string;
  managed: boolean;
  singleton: boolean;
  available: boolean;
  default_model: string | null;
  models: LlmModel[];
  required_any: string[][];
  requires: Record<string, string[]>;
  fields: LlmProviderField[];
}

export type LlmProviderConfig = Record<string, string | null>;

export type LlmProviderSource = "db" | "env";

export interface LlmProviderConnection {
  key: string;
  type: LlmProviderTypeName;
  name: string;
  source: LlmProviderSource;
  usable: boolean;
  env_vars: string[];
  env_fields: string[];
  config: LlmProviderConfig;
}

export interface LlmModel {
  id: string;
  display_name: string;
}

export interface LlmConnectionModels {
  key: string;
  name: string;
  type: LlmProviderTypeName;
  models: LlmModel[];
  error?: string | null;
}

export interface CreateLlmProviderRequest {
  type: string;
  name?: string;
  key?: string;
  config?: LlmProviderConfig;
  model?: string;
}

export interface UpdateLlmProviderRequest {
  key: string;
  name?: string;
  config?: LlmProviderConfig;
  model?: string;
}
