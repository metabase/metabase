import {
  Collection,
  CollectionId,
  DataApp,
  DataAppId,
  Database,
  Table,
} from "metabase-types/api";

type EntityList<T> = Record<
  any, // Usually a JSON stringified list query object or `null`
  { list: T[]; metadata: { total?: number; limit?: number; offset?: number } }
>;

export interface EntitiesState {
  collections?: Record<CollectionId, Collection>;
  dataApps?: Record<DataAppId, DataApp>;
  dataAppCollections?: Record<CollectionId, Collection>;
  dataAppCollections_list?: EntityList<Collection>;
  databases?: Record<number, Database>;
  tables?: Record<number | string, Table>;
}
