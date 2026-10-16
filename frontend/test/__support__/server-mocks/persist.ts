import fetchMock from "fetch-mock";

import type {
  ListPersistedInfoResponse,
  ModelCacheRefreshStatus,
} from "metabase-types/api";

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
    fetchMock.get(
      `path:/api/persist/card/${persistedModel.card_id}`,
      persistedModel,
    );
    fetchMock.post(
      `path:/api/persist/card/${persistedModel.card_id}/refresh`,
      persistedModel,
    );
  }
}
