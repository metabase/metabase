import type {
  CardId,
  ConcreteTableId,
  Document,
  ProductAnalyticsKind,
} from "metabase-types/api";

export function newEventAnalysis(): string {
  return "/event-analysis/new";
}

export function eventAnalysis(
  kind: ProductAnalyticsKind,
  tableId: ConcreteTableId,
): string {
  const params = new URLSearchParams({ table: String(tableId) });
  return `/event-analysis/new/${kind}?${params.toString()}`;
}

export function analysisDocument(document: Pick<Document, "id">): string {
  return `/event-analysis/document/${document.id}`;
}

export function savedEventAnalysis(cardId: CardId): string {
  return `/event-analysis/${cardId}`;
}
