import fetchMock from "fetch-mock";

import type {
  CardId,
  Dataset,
  Document,
  DocumentId,
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

export function setupCreateDocumentEndpoint(doc: Document) {
  fetchMock.post("path:/api/document", doc);
}

export function setupListPublicDocumentsEndpoint(
  publicDocuments: GetPublicDocument[],
) {
  fetchMock.get("path:/api/document/public", publicDocuments);
}

export function setupPublicDocumentEndpoints(uuid: string, doc: Document) {
  fetchMock.get(`path:/api/public/document/${uuid}`, doc);
}

export function setupPublicDocumentCardQueryEndpoint(
  uuid: string,
  cardId: CardId,
  dataset: Dataset,
) {
  fetchMock.get(`path:/api/public/document/${uuid}/card/${cardId}`, dataset);
}

export function setupDocumentErrorEndpoint(
  id: DocumentId,
  { status }: { status: number },
) {
  fetchMock.get(`path:/api/document/${id}`, { status });
}

export function setupPublicDocumentErrorEndpoint(
  uuid: string,
  { status }: { status: number },
) {
  fetchMock.get(`path:/api/public/document/${uuid}`, { status });
}
