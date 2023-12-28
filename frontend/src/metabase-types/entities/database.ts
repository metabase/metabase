import type { Database } from "metabase-types/api";

export interface DatabaseEntity extends Database {
  fetchIdFields: (query: any) => void;
}
