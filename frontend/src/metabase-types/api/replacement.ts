import type { CardId } from "./card";
import type { Field } from "./field";
import type { ConcreteTableId } from "./table";
import type { TransformId } from "./transform";

export type SourceReplacementEntityId = ConcreteTableId | CardId;

export const SOURCE_REPLACEMENT_ENTITY_TYPES = ["card", "table"] as const;
export type SourceReplacementEntityType =
  (typeof SOURCE_REPLACEMENT_ENTITY_TYPES)[number];

export type SourceReplacementEntry = {
  id: SourceReplacementEntityId;
  type: SourceReplacementEntityType;
};

export type SourceReplacementColumnInfo = Pick<
  Field,
  | "id"
  | "name"
  | "display_name"
  | "base_type"
  | "effective_type"
  | "semantic_type"
>;

export const SOURCE_REPLACEMENT_ERROR_TYPES = [
  "database-mismatch",
  "cycle-detected",
  "incompatible-implicit-joins",
] as const;
export type SourceReplacementErrorType =
  (typeof SOURCE_REPLACEMENT_ERROR_TYPES)[number];

export const SOURCE_REPLACEMENT_COLUMN_ERROR_TYPES = [
  "column-type-mismatch",
  "missing-primary-key",
  "missing-foreign-key",
  "foreign-key-mismatch",
] as const;
export type SourceReplacementColumnErrorType =
  (typeof SOURCE_REPLACEMENT_COLUMN_ERROR_TYPES)[number];

export type SourceReplacementColumnMapping = {
  source?: SourceReplacementColumnInfo;
  target?: SourceReplacementColumnInfo;
  errors?: SourceReplacementColumnErrorType[];
};

export type SourceReplacementCheckInfo = {
  success: boolean;
  errors?: SourceReplacementErrorType[];
  column_mappings?: SourceReplacementColumnMapping[];
};

export type SourceReplacementRunId = number;

export type SourceReplacementRunType = "replace" | "replace-with-transform";

export type SourceReplacementRunStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";

export type SourceReplacementRun = {
  id: SourceReplacementRunId;
  run_type: SourceReplacementRunType;
  status: SourceReplacementRunStatus;
  is_active: boolean | null;
  source_entity_type: SourceReplacementEntityType;
  source_entity_id: SourceReplacementEntityId;
  target_entity_type: SourceReplacementEntityType;
  target_entity_id: SourceReplacementEntityId;
  progress: number | null;
  message: string | null;
  user_id: number | null;
  start_time: string;
  end_time: string | null;
};

export type ReplaceSourceRequest = {
  source_entity_id: SourceReplacementEntityId;
  source_entity_type: SourceReplacementEntityType;
  target_entity_id: SourceReplacementEntityId;
  target_entity_type: SourceReplacementEntityType;
};

export type ReplaceSourceResponse = {
  run_id: SourceReplacementRunId;
};

export type ListSourceReplacementRunsRequest = {
  "is-active"?: boolean;
};

export type ReplaceSourceWithTransformRequest = {
  source_entity_id: SourceReplacementEntityId;
  source_entity_type: SourceReplacementEntityType;
  transform_id: TransformId;
};

export type ReplaceSourceWithTransformResponse = {
  run_id: SourceReplacementRunId;
};
