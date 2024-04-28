import type { EnabledSearchModel } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
  Verified: "verified",
  CreatedBy: "created_by",
  CreatedAt: "created_at",
  LastEditedBy: "last_edited_by",
  LastEditedAt: "last_edited_at",
  NativeQuery: "search_native_query",
} as const;

export const enabledSearchTypes: EnabledSearchModel[] = [
  "dashboard",
  "card",
  "dataset",
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
