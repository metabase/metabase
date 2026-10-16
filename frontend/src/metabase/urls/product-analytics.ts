import type { Document } from "metabase-types/api";

export function newEventAnalysis(): string {
  return "/event-analysis/new";
}

export function analysisDocument(document: Pick<Document, "id">): string {
  return `/event-analysis/document/${document.id}`;
}
