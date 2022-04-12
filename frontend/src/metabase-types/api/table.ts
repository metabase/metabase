import { Database } from "./database";
import { Field } from "./field";

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
  id: number;
  db_id: number;
  db?: Database;
  name: string;
  description: string | null;
  display_name: string;
  schema: string;
  schema_name?: string;
  visibility_type: VisibilityType;
  fields?: Field[];
}
