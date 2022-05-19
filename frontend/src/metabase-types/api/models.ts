import {
  BaseUser,
  CardId,
  CollectionId,
  CollectionAuthorityLevel,
  DatabaseId,
  UserId,
} from "metabase-types/api";

export interface ModelCacheRefreshStatus {
  id: number;
  state: "refreshing" | "persisted" | "error";
  error: string | null;
  active: boolean;

  card_id: CardId;
  card_name: string;

  collection_id: CollectionId;
  collection_name: string;
  collection_authority_level: CollectionAuthorityLevel;

  columns: string[];
  database_id: DatabaseId;
  database_name: string;
  schema_name: string;
  table_name: string;

  refresh_begin: string;
  refresh_end: string;
  "next-fire-time": string;

  creator_id?: UserId;
  creator?: BaseUser;
}
