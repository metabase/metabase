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
  effective_type: string;
  semantic_type: string | null;
};

export type MissingColumnReplaceSourceError = {
  type: "missing-column";
  columns: ReplaceSourceColumnInfo[];
};

export type ColumnTypeMismatchReplaceSourceError = {
  type: "column-type-mismatch";
  columns: ReplaceSourceColumnInfo[];
};

export type MissingPrimaryKeyReplaceSourceError = {
  type: "missing-primary-key";
  columns: ReplaceSourceColumnInfo[];
};

export type ExtraPrimaryKeyReplaceSourceError = {
  type: "extra-primary-key";
  columns: ReplaceSourceColumnInfo[];
};

export type MissingForeignKeyReplaceSourceError = {
  type: "missing-foreign-key";
  columns: ReplaceSourceColumnInfo[];
};

export type ForeignKeyMismatchReplaceSourceError = {
  type: "foreign-key-mismatch";
  columns: ReplaceSourceColumnInfo[];
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

export type CheckReplaceSourceInfo = {
  success: boolean;
  errors?: ReplaceSourceError[] | null;
};

export type ReplaceSourceRequest = {
  source_entity_id: ReplaceSourceEntityId;
  source_entity_type: ReplaceSourceEntityType;
  target_entity_id: ReplaceSourceEntityId;
  target_entity_type: ReplaceSourceEntityType;
};
