import type { EnabledSearchModelType } from "metabase/search/types";

export const SearchFilterKeys = {
  Type: "type",
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
