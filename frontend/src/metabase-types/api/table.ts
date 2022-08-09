import { ForeignKey } from "./foreign-key";
import { Database } from "./database";
import { Field } from "./field";

export type TableId = number | string; // can be string for virtual questions (e.g. "card__17")

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
  schema: string;
  fks?: ForeignKey[];
  schema_name?: string;
  visibility_type: VisibilityType;
  fields?: Field[];
}
