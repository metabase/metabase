import fetchMock from "fetch-mock";

import type { Document } from "metabase-types/api";

export function setupDocumentEndpoints(doc: Document) {
  fetchMock.get(`path:/api/ee/document/${doc.id}`, doc);
  fetchMock.post(`path:/api/ee/document/${doc.id}`, {});
  fetchMock.put(`path:/api/ee/document/${doc.id}`, async (call) => {
    const body = await call?.request?.json();
    return { ...doc, ...body };
  });
  fetchMock.delete(`path:/api/ee/document/${doc.id}`, {});
}
