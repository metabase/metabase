import type { SearchModel } from "metabase-types/api";

export interface CardEmbedRef {
  id: number;
  name?: string;
}

export type SuggestionModel = SearchModel | "user";
