import type {
  CardId,
  ConcreteTableId,
  ProductAnalyticsKind,
} from "metabase-types/api";

export function newEventAnalysis(): string {
  return "/event-analysis/new";
}

/** A new analysis opened on a kind's tab, for a table. */
export function eventAnalysis(
  kind: ProductAnalyticsKind,
  tableId: ConcreteTableId,
): string {
  const params = new URLSearchParams({ kind, table: String(tableId) });
  return `${newEventAnalysis()}?${params.toString()}`;
}

export function savedEventAnalysis(cardId: CardId): string {
  return `/event-analysis/${cardId}`;
}
