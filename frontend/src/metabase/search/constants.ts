import type { EnabledSearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
  CreatedAt: "created_at",
  Verified: "verified",
  CreatedBy: "created_by",
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
