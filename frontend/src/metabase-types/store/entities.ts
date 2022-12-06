import {
  Collection,
  CollectionId,
  DataApp,
  DataAppId,
  Database,
  NativeQuerySnippet,
  NativeQuerySnippetId,
  Table,
} from "metabase-types/api";

export interface EntitiesState {
  collections?: Record<CollectionId, Collection>;
  dataApps?: Record<DataAppId, DataApp>;
  databases?: Record<number, Database>;
  tables?: Record<number | string, Table>;
  snippets?: Record<NativeQuerySnippetId, NativeQuerySnippet>;
}
