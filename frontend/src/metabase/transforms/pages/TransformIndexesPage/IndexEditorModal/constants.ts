import { t } from "ttag";

export function getIndexTypeDescription(): string {
  return t`The data structure used to organize the index. B-tree works well for most lookups, sorting, and range queries.`;
}
