import { BaseUser, CollectionId, UserId } from "metabase-types/api";

export interface ModelCacheRefreshJob {
  id: number;
  state: "refreshing" | "persisted" | "error";
  error: string | null;
  active: boolean;

  card_id: number;
  card_name: string;

  collection_id: CollectionId;
  collection_name: string;
  collection_authority_level: "official" | null;

  columns: string[];
  database_id: number;
  database_name: string;
  schema_name: string;
  table_name: string;

  refresh_begin: string;
  refresh_end: string;
  "next-fire-time": string;

  creator_id: UserId;
  creator: BaseUser;
}
