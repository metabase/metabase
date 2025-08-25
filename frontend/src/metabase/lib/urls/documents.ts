import type { Document } from "metabase-types/api";

export function newDocument() {
  return `/document/new`;
}

export function document(document: Pick<Document, "id">) {
  return `/document/${document.id}`;
}
