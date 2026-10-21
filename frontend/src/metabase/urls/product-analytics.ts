import type { Document } from "metabase-types/api";

export function newDataAppGuide(): string {
  return "/data-app/new";
}

export function newEventAnalysis(): string {
  return "/event-analysis/new";
}

export function analysisDocument(document: Pick<Document, "id">): string {
  return `/event-analysis/document/${document.id}`;
}
