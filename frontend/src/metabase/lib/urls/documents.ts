import type { Document } from "metabase-types/api";

export function document(document: Document) {
  return `/document/${document.id}`;
}
