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

/**
 * Like `setupDocumentEndpoints`, but a PUT updates what later GETs return, as
 * the real API does. The returned function changes the stored document, for
 * changes made by other endpoints, such as reverting a revision. PUTs respond
 * only after `holdUpdatesUntil` resolves, if it is given.
 */
export function setupPersistentDocumentEndpoints(
  doc: Document,
  { holdUpdatesUntil }: { holdUpdatesUntil?: Promise<void> } = {},
) {
  let current = doc;
  fetchMock.get(`path:/api/document/${doc.id}`, () => current);
  fetchMock.put(`path:/api/document/${doc.id}`, async (call) => {
    await holdUpdatesUntil;
    // the body is the typed update request the app sent
    const body: Partial<Document> = await call?.request?.json();
    current = { ...current, ...body };
    return current;
  });
  return (changes: Partial<Document>) => {
    current = { ...current, ...changes };
  };
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

export function setupCopyDocumentEndpoint(id: DocumentId, copy: Document) {
  fetchMock.post(`path:/api/document/${id}/copy`, copy);
}
