import fetchMock from "fetch-mock";

import type {
  TranslateEntityIdResponseNotFound,
  TranslateEntityIdResponseSuccess,
} from "metabase/api";

export const setupTranslateEntityIdEndpoint = (
  mockResponse: Record<
    string, // this should be BaseEntityId, but in tests we probably want to use plain strings
    TranslateEntityIdResponseSuccess | TranslateEntityIdResponseNotFound
  >,
) => {
  fetchMock.post("path:/api/util/entity_id", {
    body: { entity_ids: mockResponse },
    status: 200,
  });
};

export const callsToTranslateEntityIdEndpoint = () => {
  return fetchMock.calls("path:/api/util/entity_id");
};
