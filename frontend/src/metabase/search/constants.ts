import type { EnabledSearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
  Verified: "verified",
  CreatedBy: "created_by",
  CreatedAt: "created_at",
  LastEditedBy: "last_edited_by",
  LastEditedAt: "last_edited_at",
  NativeQuery: "search_native_query",
} as const;

export const enabledSearchTypes: EnabledSearchModelType[] = [
  "dashboard",
  "card",
  "dataset",
  "collection",
  "database",
  "table",
  "action",
];
