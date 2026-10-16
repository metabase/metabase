import fetchMock from "fetch-mock";

import type {
  Document,
  GetDocumentCardsResponse,
  GetPublicDocument,
} from "metabase-types/api";

export function setupDocumentEndpoints(doc: Document) {
  fetchMock.get(`path:/api/document/${doc.id}`, doc);
  fetchMock.post(`path:/api/document/${doc.id}`, {});
  fetchMock.put(`path:/api/document/${doc.id}`, async (call) => {
    const body = await call?.request?.json();
    return { ...doc, ...body };
  });
  fetchMock.delete(`path:/api/document/${doc.id}`, {});
}

export function setupDocumentNotFoundEndpoint(doc: Document) {
  fetchMock.get(`path:/api/document/${doc.id}`, 404);
}

export function setupCreateDocumentEndpoint(doc: Document) {
  fetchMock.post("path:/api/document", doc);
}

export function setupListPublicDocumentsEndpoint(
  publicDocuments: GetPublicDocument[],
) {
  fetchMock.get("path:/api/document/public", publicDocuments);
}

export function setupDocumentCardsEndpoint(
  doc: Document,
  response: GetDocumentCardsResponse,
) {
  fetchMock.get(`path:/api/document/${doc.id}/cards`, response);
}
