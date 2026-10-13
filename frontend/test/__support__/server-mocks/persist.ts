import fetchMock from "fetch-mock";

import type {
  ListPersistedInfoResponse,
  ModelCacheRefreshStatus,
} from "metabase-types/api";

export function setupModelPersistenceEndpoints(
  persistedModels: ModelCacheRefreshStatus[],
  overrides: Partial<Pick<ListPersistedInfoResponse, "total">> = {},
) {
  fetchMock.get(
    `path:/api/persist`,
    {
      data: persistedModels,
      limit: 20,
      offset: 0,
      total: persistedModels.length,
      ...overrides,
    },
    { name: "persist-list" },
  );

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
