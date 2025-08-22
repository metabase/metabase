import type { SearchModel } from "metabase-types/api";

export const LINK_SEARCH_MODELS: SearchModel[] = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "database",
  "table",
  "collection",
  "document",
];

export const EMBED_SEARCH_MODELS: SearchModel[] = ["card", "dataset"];

export const LINK_SEARCH_LIMIT = 5;
