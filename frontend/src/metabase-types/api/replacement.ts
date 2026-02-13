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
  database_type: string;
};

export type MissingColumnReplaceSourceError = {
  type: "missing-column";
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

export type ReplaceSourceError =
  | MissingColumnReplaceSourceError
  | MissingPrimaryKeyReplaceSourceError
  | ExtraPrimaryKeyReplaceSourceError
  | MissingForeignKeyReplaceSourceError;

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
