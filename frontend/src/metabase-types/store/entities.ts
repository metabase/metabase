import { Collection, CollectionId, Database, Table } from "metabase-types/api";

export interface EntitiesState {
  collections?: Record<CollectionId, Collection>;
  databases?: Record<number, Database>;
  tables?: Record<number | string, Table>;
}
