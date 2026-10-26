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
  done_table_ids: ConcreteTableId[] | null;
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

export type MetadataGenerationProposalId = number;

export type MetadataGenerationValueSource =
  | "human"
  | "ai"
  | "deterministic"
  | "none";

export type MetadataGenerationConfidence = "high" | "medium" | "low";

/** The pending AI proposals of one table. */
export type MetadataGenerationProposalTable = {
  table_id: ConcreteTableId;
  table_name: string | null;
  schema: string | null;
  pending: number;
  /** The pending proposals that would replace a value a person set. */
  human_set_pending: number;
};

/** Give `database_id` (with `schema` when needed) or `table_id`. */
export type ListMetadataGenerationProposalsRequest =
  | { database_id: DatabaseId; schema?: SchemaName; table_id?: never }
  | { table_id: ConcreteTableId; database_id?: never; schema?: never };

/** A pending AI proposal. `source` and `current_value` are the value readers see now. */
export type MetadataGenerationProposal = {
  id: MetadataGenerationProposalId;
  last_run_id: MetadataGenerationRunId | null;
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
  confidence: MetadataGenerationConfidence | null;
  reasoning: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * One review. Give `accept` and `edits`, or `reject_all` with `database_id`. An edit replaces the proposed value and
 * accepts its proposal. `proposed_values` gives the proposed value the client saw: a proposal that a run changed
 * since is skipped as `changed`. `reject_all` deletes every pending proposal of the database.
 */
export type ApplyMetadataGenerationProposalsRequest = {
  accept?: MetadataGenerationProposalId[];
  edits?: Record<MetadataGenerationProposalId, string>;
  proposed_values?: Record<MetadataGenerationProposalId, string>;
  reject_all?: boolean;
  database_id?: DatabaseId;
};

export type MetadataGenerationApplyFailureReason =
  | "changed"
  | "field_not_found"
  | "not_writable"
  | "key_field"
  | "type_mismatch"
  | "error";

export type MetadataGenerationApplyFailure = {
  proposal_id: MetadataGenerationProposalId;
  field_id: FieldId | null;
  attribute: MetadataGenerationAttribute | null;
  reason: MetadataGenerationApplyFailureReason;
};

export type MetadataGenerationApplyResult = {
  written: number;
  rejected: number;
  failed: number;
  failures: MetadataGenerationApplyFailure[];
};
