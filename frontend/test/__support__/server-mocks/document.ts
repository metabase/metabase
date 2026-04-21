import fetchMock from "fetch-mock";

import type { Document, GetPublicDocument } from "metabase-types/api";

export function setupDocumentEndpoints(doc: Document) {
  fetchMock.get(`path:/api/document/${doc.id}`, doc);
  fetchMock.post(`path:/api/document/${doc.id}`, {});
  fetchMock.put(`path:/api/document/${doc.id}`, async (call) => {
    const body = await call?.request?.json();
    return { ...doc, ...body };
  });
  fetchMock.delete(`path:/api/document/${doc.id}`, {});
}

export function setupListPublicDocumentsEndpoint(
  publicDocuments: GetPublicDocument[],
) {
  fetchMock.get("path:/api/document/public", publicDocuments);
}
