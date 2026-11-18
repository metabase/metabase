import fetchMock from "fetch-mock";

import type {
  ListPersistedInfoResponse,
  ModelCacheRefreshStatus,
} from "metabase-types/api";

/**
 * Mocks the model persistence endpoints. Persisting or unpersisting a model
 * updates the state that `GET /api/persist/card/:id` returns afterwards.
 */
export function setupModelPersistenceEndpoints(
  persistedModels: ModelCacheRefreshStatus[],
) {
  fetchMock.get(`path:/api/persist`, ({ url }) => {
    const params = new URL(url, "http://localhost").searchParams;
    const limit = Number(params.get("limit") ?? persistedModels.length);
    const offset = Number(params.get("offset") ?? 0);
    const response: ListPersistedInfoResponse = {
      data: persistedModels.slice(offset, offset + limit),
      limit,
      offset,
      total: persistedModels.length,
    };
    return response;
  });

  for (const persistedModel of persistedModels) {
    const cardId = persistedModel.card_id;
    let currentModel = persistedModel;

    fetchMock.get(`path:/api/persist/card/${cardId}`, () => currentModel);
    fetchMock.post(
      `path:/api/persist/card/${cardId}/refresh`,
      () => currentModel,
    );
    fetchMock.post(`path:/api/persist/card/${cardId}/persist`, () => {
      currentModel = { ...currentModel, state: "creating" };
      return { status: 204 };
    });
    fetchMock.post(`path:/api/persist/card/${cardId}/unpersist`, () => {
      currentModel = { ...currentModel, state: "off" };
      return { status: 204 };
    });
  }
}
