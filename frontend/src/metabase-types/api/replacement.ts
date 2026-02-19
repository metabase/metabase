import type { CardId } from "./card";
import type { ConcreteTableId } from "./table";

export type ReplaceSourceEntityId = ConcreteTableId | CardId;

export const REPLACE_SOURCE_ENTITY_TYPES = ["card", "table"] as const;
export type ReplaceSourceEntityType =
  (typeof REPLACE_SOURCE_ENTITY_TYPES)[number];

export type ReplaceSourceEntry = {
  id: ReplaceSourceEntityId;
  type: ReplaceSourceEntityType;
};

export type ReplaceSourceColumnInfo = {
  name: string;
  display_name: string;
  base_type: string;
  effective_type: string | null;
  semantic_type: string | null;
};

export type ReplaceSourceErrorType =
  | "missing-column"
  | "column-type-mismatch"
  | "missing-primary-key"
  | "extra-primary-key"
  | "missing-foreign-key"
  | "foreign-key-mismatch";

export type ReplaceSourceColumnComparison = {
  source: ReplaceSourceColumnInfo | null;
  target: ReplaceSourceColumnInfo | null;
  errors: ReplaceSourceErrorType[] | null;
};

export type ReplaceSourceRunId = number;

export type ReplaceSourceRunStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "timeout";

export type ReplaceSourceRun = {
  id: ReplaceSourceRunId;
  status: ReplaceSourceRunStatus;
  progress: number;
  start_time: string;
};

export type ReplaceSourceRequest = {
  source_entity_id: ReplaceSourceEntityId;
  source_entity_type: ReplaceSourceEntityType;
  target_entity_id: ReplaceSourceEntityId;
  target_entity_type: ReplaceSourceEntityType;
};

export type CheckReplaceSourceResponse = {
  success: boolean;
  column_comparison: ReplaceSourceColumnComparison[];
};

export type ReplaceSourceResponse = {
  run_id: ReplaceSourceRunId;
};
