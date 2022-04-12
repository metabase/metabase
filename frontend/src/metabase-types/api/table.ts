import { Database } from "./database";

export interface Table {
  id: number;
  db_id: number;
  db?: Database;
  name: string;
  schema: string;
  schema_name?: string;
}
