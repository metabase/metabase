import type { ProductAnalyticsKind, TableId } from "metabase-types/api";

export function newProductAnalysis(
  kind: ProductAnalyticsKind,
  tableId?: TableId,
): string {
  const params = new URLSearchParams({ kind });
  if (tableId !== undefined) {
    params.set("table", String(tableId));
  }
  return `/product-analysis/new?${params.toString()}`;
}
