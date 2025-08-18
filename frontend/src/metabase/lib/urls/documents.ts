import type { Document } from "metabase-types/api";

export function document(document: Pick<Document, "id">) {
  return `/document/${document.id}`;
}
