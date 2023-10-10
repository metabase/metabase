import type { EnabledSearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
  Verified: "verified",
  CreatedBy: "created_by",
  LastEditedBy: "last_edited_by",
  NativeQuery: "search_native_query",
} as const;

export const enabledSearchTypes: EnabledSearchModelType[] = [
  "collection",
  "dashboard",
  "card",
  "database",
  "table",
  "dataset",
  "action",
];
