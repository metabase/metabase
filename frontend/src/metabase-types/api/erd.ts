import type {
  ConcreteTableId,
  DatabaseId,
  FieldId,
  SchemaName,
  TableId,
  TableOwner,
} from "./";

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
  base_type: string;
  effective_type: string | null;
  semantic_type: string | null;
  fk_target_field_id: FieldId | null;
  fk_target_table_id: ConcreteTableId | null;
};

export type ErdNode = {
  table_id: ConcreteTableId;
  name: string;
  display_name: string;
  description: string | null;
  // Mirrors the `:owner` hydration on Table: either the full `TableOwner`
  // shape, an email-only fallback when only `owner_email` is set, or `null`.
  owner: TableOwner | { email: string } | null;
  schema: SchemaName | null;
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

/**
 * Backend semantics:
 *  - With a schema, the backend returns all tables in that schema; we only
 *    append `table-ids` for external tables the user has explicitly expanded
 *    into.
 *  - With no schema but explicit table-ids, those are the focal set.
 *  - At least one of `schema` or `table-ids` must be provided.
 */
export type ErdParams = {
  "database-id": DatabaseId;
  "table-ids"?: TableId[];
  schema?: SchemaName;
};
