import type { DatabaseId } from "./database";
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
};

export type MetadataGenerationUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  total_tokens: number;
  cost_usd?: number | null;
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
