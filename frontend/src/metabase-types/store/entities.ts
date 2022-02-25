import { Database } from "metabase-types/types/Database";
import { Table } from "metabase-types/types/Table";

export interface EntitiesState {
  databases: Record<number, Database>;
  tables: Record<number | string, Table>;
}
