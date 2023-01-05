import {
  Collection,
  CollectionId,
  Database,
  NativeQuerySnippet,
  NativeQuerySnippetId,
  Table,
  User,
  UserId,
} from "metabase-types/api";

export interface EntitiesState {
  collections?: Record<CollectionId, Collection>;
  databases?: Record<number, Database>;
  tables?: Record<number | string, Table>;
  snippets?: Record<NativeQuerySnippetId, NativeQuerySnippet>;
  users?: Record<UserId, User>;
}
