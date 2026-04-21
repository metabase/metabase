import type { EnabledSearchModel } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
  Verified: "verified",
  CreatedBy: "created_by",
  CreatedAt: "created_at",
  LastEditedBy: "last_edited_by",
  LastEditedAt: "last_edited_at",
  NativeQuery: "search_native_query",
  SearchTrashedItems: "archived",
  PersonalCollections: "filter_items_in_personal_collection",
} as const;

export const enabledSearchTypes: EnabledSearchModel[] = [
  "dashboard",
  "card",
  "dataset",
  "metric",
  "collection",
  "database",
  "table",
  "action",
  "indexed-entity",
];

export const SearchContextTypes = {
  SEARCH_BAR: "search-bar",
  SEARCH_APP: "search-app",
} as const;
