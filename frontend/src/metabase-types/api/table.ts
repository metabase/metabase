import { ForeignKey } from "./foreign-key";
import { Database, DatabaseId, InitialSyncStatus } from "./database";
import { Field } from "./field";

export type ConcreteTableId = number;
export type VirtualTableId = string; // e.g. "card__17" where 17 is a card id
export type TableId = ConcreteTableId | VirtualTableId;
export type SchemaId = string;

export type TableVisibilityType =
  | null
  | "details-only"
  | "hidden"
  | "normal"
  | "retired"
  | "sensitive"
  | "technical"
  | "cruft";

export type TableFieldOrder = "database" | "alphabetical" | "custom" | "smart";

export interface Table {
  id: TableId;
  db_id: DatabaseId;
  db?: Database;
  name: string;
  description: string | null;
  display_name: string;
  schema: string;
  fks?: ForeignKey[];
  schema_name?: string;
  visibility_type: TableVisibilityType;
  fields?: Field[];
  field_order: TableFieldOrder;
  initial_sync_status: InitialSyncStatus;
}

export interface Schema {
  id: SchemaId;
  name: string;
}

export interface TableQuery {
  include_editable_data_model?: boolean;
}

export interface TableListQuery {
  dbId?: DatabaseId;
  schemaName?: string;
  include_hidden?: boolean;
  include_editable_data_model?: boolean;
}
