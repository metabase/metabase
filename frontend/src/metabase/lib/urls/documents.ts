import MetabaseSettings from "metabase/lib/settings";
import type { Document } from "metabase-types/api";

export function newDocument() {
  return `/document/new`;
}

export function document(document: Pick<Document, "id">) {
  return `/document/${document.id}`;
}

export function publicDocument(uuid: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/document/${uuid}`;
}
