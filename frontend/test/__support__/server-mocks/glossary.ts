import fetchMock, { type CallLog } from "fetch-mock";

import type { GlossaryItem, ListGlossaryResponse } from "metabase/api";

type MockResponse<T> = T | ((call: CallLog) => T | Promise<T>);

export function setupListGlossaryEndpoint(
  response: MockResponse<ListGlossaryResponse>,
) {
  fetchMock.get("path:/api/glossary", response);
}

export function setupCreateGlossaryEndpoint(
  response: MockResponse<GlossaryItem>,
) {
  fetchMock.post("path:/api/glossary", response);
}

export function setupUpdateGlossaryEndpoint(item: GlossaryItem) {
  fetchMock.put(`path:/api/glossary/${item.id}`, item);
}

export function setupDeleteGlossaryEndpoint(id: GlossaryItem["id"]) {
  fetchMock.delete(`path:/api/glossary/${id}`, 204);
}
