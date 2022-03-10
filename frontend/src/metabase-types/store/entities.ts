import { Database, Table } from "metabase-types/api";

export interface EntitiesState {
  databases?: Record<number, Database>;
  tables?: Record<number | string, Table>;
}
