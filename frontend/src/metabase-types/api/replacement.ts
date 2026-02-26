import type { CardId } from "./card";
import type { Field } from "./field";
import type { ConcreteTableId } from "./table";

export type ReplaceSourceEntityId = ConcreteTableId | CardId;

export const REPLACE_SOURCE_ENTITY_TYPES = ["card", "table"] as const;
export type ReplaceSourceEntityType =
  (typeof REPLACE_SOURCE_ENTITY_TYPES)[number];

export type ReplaceSourceEntry = {
  id: ReplaceSourceEntityId;
  type: ReplaceSourceEntityType;
};

export type ReplaceSourceColumnInfo = Pick<
  Field,
  | "id"
  | "name"
  | "display_name"
  | "base_type"
  | "effective_type"
  | "semantic_type"
>;

export const REPLACE_SOURCE_ERROR_TYPES = [
  "database-mismatch",
  "cycle-detected",
] as const;
export type ReplaceSourceErrorType =
  (typeof REPLACE_SOURCE_ERROR_TYPES)[number];

export const REPLACE_SOURCE_COLUMN_ERROR_TYPES = [
  "column-type-mismatch",
  "missing-primary-key",
  "extra-primary-key",
  "missing-foreign-key",
] as const;
export type ReplaceSourceColumnErrorType =
  (typeof REPLACE_SOURCE_COLUMN_ERROR_TYPES)[number];

export type ReplaceSourceColumnMapping = {
  source: ReplaceSourceColumnInfo | null;
  target: ReplaceSourceColumnInfo | null;
  errors?: ReplaceSourceColumnErrorType[];
};

export type CheckReplaceSourceInfo = {
  success: boolean;
  errors?: ReplaceSourceErrorType[];
  column_mappings?: ReplaceSourceColumnMapping[];
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

export type ReplaceSourceResponse = {
  run_id: ReplaceSourceRunId;
};
