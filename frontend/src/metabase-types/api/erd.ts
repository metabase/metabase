import type { DatabaseId, FieldId, TableId } from "./";

export type ErdRelationship = "one-to-one" | "many-to-one";

export type ErdField = {
  id: FieldId;
  name: string;
  display_name: string;
  database_type: string;
  semantic_type: string | null;
  fk_target_field_id: FieldId | null;
  fk_target_table_id: TableId | null;
};

export type ErdNode = {
  table_id: TableId;
  name: string;
  display_name: string;
  schema: string | null;
  db_id: DatabaseId;
  fields: ErdField[];
};

export type ErdEdge = {
  source_table_id: TableId;
  source_field_id: FieldId;
  target_table_id: TableId;
  target_field_id: FieldId;
  relationship: ErdRelationship;
};

export type ErdResponse = {
  nodes: ErdNode[];
  edges: ErdEdge[];
};

export type GetErdRequest = {
  "database-id": DatabaseId;
  "table-ids"?: TableId[];
  schema?: string;
};
