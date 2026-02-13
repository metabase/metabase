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

export type MissingColumnReplaceSourceError = {
  type: "missing-column";
  name: string;
  database_type: string;
};

export type ColumnTypeMismatchReplaceSourceError = {
  type: "column-type-mismatch";
  name: string;
  source_database_type: string;
  target_database_type: string;
};

export type MissingPrimaryKeyReplaceSourceError = {
  type: "missing-primary-key";
  name: string;
  database_type: string;
};

export type ExtraPrimaryKeyReplaceSourceError = {
  type: "extra-primary-key";
  name: string;
  database_type: string;
};

export type MissingForeignKeyReplaceSourceError = {
  type: "missing-foreign-key";
  name: string;
  source_fk_target_field_name: string | null;
  source_fk_target_table_name: string | null;
};

export type ForeignKeyMismatchReplaceSourceError = {
  type: "foreign-key-mismatch";
  name: string;
  source_fk_target_field_name: string | null;
  source_fk_target_table_name: string | null;
  target_fk_target_field_name: string | null;
  target_fk_target_table_name: string | null;
};

export type ReplaceSourceError =
  | MissingColumnReplaceSourceError
  | ColumnTypeMismatchReplaceSourceError
  | MissingPrimaryKeyReplaceSourceError
  | ExtraPrimaryKeyReplaceSourceError
  | MissingForeignKeyReplaceSourceError
  | ForeignKeyMismatchReplaceSourceError;

export type ReplaceSourceErrorType = ReplaceSourceError["type"];

export type CheckReplaceSourceRequest = {
  source_entity_id: ReplaceSourceEntityId;
  source_entity_type: ReplaceSourceEntityType;
  target_entity_id: ReplaceSourceEntityId;
  target_entity_type: ReplaceSourceEntityType;
};

export type CheckReplaceSourceResponse = {
  success: boolean;
  errors?: ReplaceSourceError[] | null;
};

export type ReplaceSourceRequest = {
  source_entity_id: ReplaceSourceEntityId;
  source_entity_type: ReplaceSourceEntityType;
  target_entity_id: ReplaceSourceEntityId;
  target_entity_type: ReplaceSourceEntityType;
};
