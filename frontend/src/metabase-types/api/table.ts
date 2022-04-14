import { ForeignKey } from "../api/foreignKey";
import { Database } from "./database";

export interface Table {
  id: number;
  db_id: number;
  db?: Database;
  name: string;
  schema: string;
  fks?: ForeignKey[];
  schema_name?: string;
}
