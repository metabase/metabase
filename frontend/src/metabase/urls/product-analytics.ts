import type { CardId, ConcreteTableId } from "metabase-types/api";

export function newAnalysis(tableId?: ConcreteTableId): string {
  return tableId === undefined
    ? "/product-analysis/new"
    : `/product-analysis/new?table=${tableId}`;
}

export function savedAnalysis(cardId: CardId): string {
  return `/product-analysis/${cardId}`;
}
