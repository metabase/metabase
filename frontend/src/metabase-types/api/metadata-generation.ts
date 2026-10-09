import type { DatabaseId } from "./database";
import type { FieldId } from "./field";
import type { ConcreteTableId, SchemaName } from "./table";
import type { UserId } from "./user";

export type MetadataGenerationRunId = number;

export type MetadataGenerationAttribute =
  | "data_sensitivity"
  | "semantic_type"
  | "description";

export type MetadataGenerationRunStatus =
  | "pending"
  | "running"
  | "canceling"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout"
  | "usage_limit";

export type MetadataGenerationScope =
  | { type: "database" }
  | { type: "schemas"; schemas: SchemaName[] }
  | { type: "tables"; table_ids: ConcreteTableId[] };

export type MetadataGenerationTableError = {
  table_id: ConcreteTableId;
  table_name?: string | null;
  schema?: string | null;
  message: string;
  error_code?: string | null;
  elapsed_ms?: number | null;
};

export type MetadataGenerationUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  total_tokens: number;
  cost_usd?: number | null;
  max_table_ms?: number;
  slow_calls?: number;
};

export type MetadataGenerationRun = {
  id: MetadataGenerationRunId;
  database_id: DatabaseId;
  scope: MetadataGenerationScope;
  attributes: MetadataGenerationAttribute[];
  status: MetadataGenerationRunStatus;
  is_active: true | null;
  total_tables: number;
  done_tables: number;
  failed_tables: number;
  table_errors: MetadataGenerationTableError[] | null;
  message: string | null;
  usage: MetadataGenerationUsage | null;
  creator_id: UserId | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  ended_at: string | null;
  last_heartbeat: string | null;
};

export type MetadataGenerationRunRequest = {
  database_id: DatabaseId;
  schemas?: SchemaName[];
  table_ids?: ConcreteTableId[];
  attributes?: MetadataGenerationAttribute[];
};

export type ListMetadataGenerationRunsRequest = {
  database_id: DatabaseId;
};

export type MetadataGenerationUnavailableReason =
  | "metabot-disabled"
  | "no-llm"
  | "usage-limit";

export type MetadataGenerationEstimate = {
  table_count: number;
  field_count: number;
  total_tokens: number;
  cost_usd: number;
  unavailable_reason: MetadataGenerationUnavailableReason | string | null;
};

export type MetadataGenerationSuggestionId = number;

export type MetadataGenerationSuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "stale"
  | "applied";

export type MetadataGenerationValueSource =
  | "human"
  | "ai"
  | "deterministic"
  | "none";

export type MetadataGenerationConfidence = "high" | "medium" | "low";

export type MetadataGenerationStatusCounts = Record<
  MetadataGenerationSuggestionStatus,
  number
>;

export type MetadataGenerationRunTable = {
  table_id: ConcreteTableId;
  table_name: string | null;
  schema: string | null;
  total: number;
  counts: MetadataGenerationStatusCounts;
  human_set_pending: number;
};

export type MetadataGenerationSuggestion = {
  id: MetadataGenerationSuggestionId;
  run_id: MetadataGenerationRunId;
  table_id: ConcreteTableId;
  field_id: FieldId;
  field_name: string;
  field_display_name: string | null;
  field_base_type: string;
  field_effective_type: string | null;
  attribute: MetadataGenerationAttribute;
  source: MetadataGenerationValueSource;
  current_value: string | null;
  proposed_value: string;
  /** The value a person chose in place of `proposed_value`. Apply writes it as the person's value. */
  edited_value: string | null;
  confidence: MetadataGenerationConfidence | null;
  reasoning: string | null;
  status: MetadataGenerationSuggestionStatus;
  decided_by: UserId | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GetMetadataGenerationSuggestionsRequest = {
  run_id: MetadataGenerationRunId;
  table_id: ConcreteTableId;
};

export type MetadataGenerationDecision = "accept" | "unaccept" | "reject";

export type MetadataGenerationDecisionRequest = {
  run_id: MetadataGenerationRunId;
  decision: MetadataGenerationDecision;
  suggestion_ids?: MetadataGenerationSuggestionId[];
  table_ids?: ConcreteTableId[];
  all?: boolean;
  include_human_set?: boolean;
};

export type EditMetadataGenerationSuggestionRequest = {
  run_id: MetadataGenerationRunId;
  suggestion_id: MetadataGenerationSuggestionId;
  /** `null` clears the edit. */
  value: string | null;
};

export type MetadataGenerationDecisionResponse = {
  updated: number;
};

export type ApplyMetadataGenerationRunRequest = {
  run_id: MetadataGenerationRunId;
  table_ids?: ConcreteTableId[];
};

export type MetadataGenerationApplyFailureReason =
  | "field_not_found"
  | "not_writable"
  | "key_field"
  | "type_mismatch"
  | "error";

export type MetadataGenerationApplyFailure = {
  suggestion_id: MetadataGenerationSuggestionId;
  field_id: FieldId;
  attribute: MetadataGenerationAttribute;
  reason: MetadataGenerationApplyFailureReason;
};

export type MetadataGenerationApplyResult = {
  written: number;
  stale: number;
  failed: number;
  failures: MetadataGenerationApplyFailure[];
};
