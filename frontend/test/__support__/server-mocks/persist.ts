import fetchMock from "fetch-mock";

import type { ModelCacheRefreshStatus } from "metabase-types/api";

export function setupModelPersistenceEndpoints(
  persistedModels: ModelCacheRefreshStatus[],
) {
  fetchMock.get(`path:/api/persist`, {
    data: persistedModels,
    limit: 20,
    offset: 0,
    total: persistedModels.length,
  });

  for (const persistedModel of persistedModels) {
    fetchMock.get(
      `path:/api/persist/card/${persistedModel.card_id}`,
      persistedModel,
    );
    fetchMock.post(
      `path:/api/card/${persistedModel.card_id}/refresh`,
      persistedModel,
    );
  }
}
