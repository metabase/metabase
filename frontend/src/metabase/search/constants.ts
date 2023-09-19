import type { EnabledSearchModelType } from "metabase-types/api";

export const SearchFilterKeys = {
  Type: "type",
  Verified: "verified",
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
