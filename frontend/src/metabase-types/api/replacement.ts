import type { CardId } from "./card";
import type { Field } from "./field";
import type { ConcreteTableId, Table } from "./table";

export type ReplaceSourceEntityId = ConcreteTableId | CardId;

export const REPLACE_SOURCE_ENTITY_TYPES = ["card", "table"] as const;
export type ReplaceSourceEntityType =
  (typeof REPLACE_SOURCE_ENTITY_TYPES)[number];

export type ReplaceSourceEntry = {
  id: ReplaceSourceEntityId;
  type: ReplaceSourceEntityType;
};

export type ReplaceSourceTableInfo = Pick<
  Table,
  "id" | "name" | "display_name" | "schema"
>;

export type ReplaceSourceFieldInfo = Pick<
  Field,
  "id" | "name" | "display_name"
> & {
  table?: ReplaceSourceTableInfo;
};

export type ReplaceSourceColumnInfo = Pick<
  Field,
  "id" | "name" | "display_name" | "database_type" | "fk_target_field_id"
> & {
  target?: ReplaceSourceFieldInfo;
};

export type ReplaceSourceErrorType =
  | "missing-column"
  | "column-type-mismatch"
  | "missing-primary-key"
  | "extra-primary-key"
  | "missing-foreign-key"
  | "foreign-key-mismatch";

export type ReplaceSourceColumnMapping = {
  source?: ReplaceSourceColumnInfo;
  target?: ReplaceSourceColumnInfo;
  errors?: ReplaceSourceErrorType[];
};

export type CheckReplaceSourceInfo = {
  success: boolean;
  column_mappings: ReplaceSourceColumnMapping[];
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
