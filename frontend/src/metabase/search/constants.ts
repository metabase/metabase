export const SearchFilterKeys = {
  Type: "type",
  CreatedBy: "created_by",
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
