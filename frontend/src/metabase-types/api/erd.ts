import type { CardId, DatabaseId, FieldId, TableId } from "./";

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
  is_focal: boolean;
  fields: ErdField[];
};

export type ErdEdge = {
  source_table_id: TableId;
  source_field_id: FieldId;
  target_table_id: TableId;
  target_field_id: FieldId;
  relationship: string;
};

export type ErdResponse = {
  nodes: ErdNode[];
  edges: ErdEdge[];
};

export type GetErdRequest =
  | { "model-id": CardId; "database-id"?: never; "table-ids"?: never; schema?: never; hops?: number }
  | { "model-id"?: never; "database-id": DatabaseId; "table-ids"?: TableId[]; schema?: string; hops?: number };
