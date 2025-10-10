import type { CardId, Field, type SearchResult } from "metabase-types/api";

export type ModelColumnUpdate = {
  name: string;
} & Partial<Field>;

export type ModelSearchItem = SearchResult<CardId, "dataset">;
