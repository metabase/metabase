import type { ConcreteTableId, DatabaseId, FieldId, TableId } from "./";

export type ErdRelationship = "one-to-one" | "many-to-one";

// The ERD endpoint never traverses cards / saved-question virtual tables —
// it loads from `:model/Table` and validates `table-ids` as positive ints.
// Use `ConcreteTableId` here (rather than the wider `TableId` union) so
// consumers don't need to cast every id.
export type ErdField = {
  id: FieldId;
  name: string;
  display_name: string;
  database_type: string;
  base_type: string | null;
  effective_type: string | null;
  semantic_type: string | null;
  fk_target_field_id: FieldId | null;
  fk_target_table_id: ConcreteTableId | null;
};

export type ErdNode = {
  table_id: ConcreteTableId;
  name: string;
  display_name: string;
  schema: string | null;
  db_id: DatabaseId;
  fields: ErdField[];
};

export type ErdEdge = {
  source_table_id: ConcreteTableId;
  source_field_id: FieldId;
  target_table_id: ConcreteTableId;
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
