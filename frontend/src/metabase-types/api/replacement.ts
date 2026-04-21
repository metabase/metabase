import type { CardId } from "./card";
import type { CollectionId } from "./collection";
import type { Field } from "./field";
import type { ConcreteTableId } from "./table";
import type { TransformId, TransformTagId, TransformTarget } from "./transform";

export type SourceReplacementEntityId = ConcreteTableId | CardId | TransformId;

export const SOURCE_REPLACEMENT_ENTITY_TYPES = [
  "card",
  "table",
  "transform",
] as const;
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
  "affects-gtap-policies",
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

export type SourceReplacementRunStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";

export type SourceReplacementRun = {
  id: SourceReplacementRunId;
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

export type ReplaceModelWithTransformRequest = {
  card_id: CardId;
  transform_name: string;
  transform_target: TransformTarget;
  target_collection_id: CollectionId | null;
  transform_tag_ids?: TransformTagId[];
};

export type ReplaceModelWithTransformResponse = {
  run_id: SourceReplacementRunId;
};
