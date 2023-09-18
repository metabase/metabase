export const SearchFilterKeys = {
  Type: "type",
  CreatedAt: "created_at",
} as const;

export const enabledSearchTypes = [
  "collection",
  "dashboard",
  "card",
  "database",
  "table",
  "dataset",
  "action",
];
