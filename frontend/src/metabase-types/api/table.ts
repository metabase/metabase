import { ForeignKey } from "../api/foreignKey";
import { Database } from "./database";
import { Field } from "./field";

export type TableId = number;

export type SchemaName = string;

export type VisibilityType =
  | null
  | "details-only"
  | "hidden"
  | "normal"
  | "retired"
  | "sensitive"
  | "technical"
  | "cruft";

export interface Table {
  id: TableId;
  db_id: number;
  db?: Database;
  name: string;
  description: string | null;
  display_name: string;
  schema: SchemaName;
  fks?: ForeignKey[];
  schema_name?: string;
  visibility_type: VisibilityType;
  fields?: Field[];
}
