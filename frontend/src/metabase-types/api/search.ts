import { DatabaseId } from "./database";

export type SearchModelType =
  | "card"
  | "collection"
  | "dashboard"
  | "database"
  | "dataset"
  | "table"
  | "indexed-entity"
  | "pulse";

export interface SearchListQuery {
  q?: string;
  models?: SearchModelType | SearchModelType[];
  archived?: boolean;
  table_db_id?: DatabaseId;
  limit?: number;
  offset?: number;
}
