import { t } from "ttag";

export function getIndexTypeDescription(): string {
  return t`The data structure used to organize the index. B-tree works well for most lookups, sorting, and range queries.`;
}

export function getKindDescription(kind: string): string | null {
  switch (kind) {
    case "btree":
      return t`Default. Best for equality and range queries on sortable data; use it for most columns you filter, sort, or join by.`;
    case "gin":
      return t`For values with multiple components. Best for full-text search, JSONB, and arrays—when you're searching inside a value.`;
    case "gist":
      return t`For geometric, spatial, and range data. Best for "nearest neighbor" and overlap queries, like geographic data (PostGIS) or range types.`;
    case "brin":
      return t`Tiny and low-overhead. Best for large tables where values correlate with physical row order, like timestamps in an append-only log.`;
    default:
      return null;
  }
}
