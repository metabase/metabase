import type {
  CardId,
  ConcreteTableId,
  ProductAnalyticsKind,
} from "metabase-types/api";

/** A new analysis of a kind, which starts by picking its table. */
export function newEventAnalysis(kind: ProductAnalyticsKind): string {
  const params = new URLSearchParams({ kind });
  return `/event-analysis/new?${params.toString()}`;
}

/** A new analysis opened on a kind's tab, for a table. */
export function eventAnalysis(
  kind: ProductAnalyticsKind,
  tableId: ConcreteTableId,
): string {
  const params = new URLSearchParams({ kind, table: String(tableId) });
  return `/event-analysis/new?${params.toString()}`;
}

export function savedEventAnalysis(cardId: CardId): string {
  return `/event-analysis/${cardId}`;
}
