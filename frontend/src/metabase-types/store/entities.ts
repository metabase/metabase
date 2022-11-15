import {
  Collection,
  CollectionId,
  DataApp,
  DataAppId,
  Database,
  Table,
} from "metabase-types/api";

export interface EntitiesState {
  collections?: Record<CollectionId, Collection>;
  dataApps?: Record<DataAppId, DataApp>;
  dataAppCollections?: Record<CollectionId, Collection>;
  databases?: Record<number, Database>;
  tables?: Record<number | string, Table>;
}
