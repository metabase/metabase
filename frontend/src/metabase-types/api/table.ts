import { ForeignKey } from "../api/foreignKey";

export interface Table {
  id: number;
  db_id: number;
  name: string;
  schema: string;
  fks?: ForeignKey[];
}
