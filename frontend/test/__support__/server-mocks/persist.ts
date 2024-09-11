import fetchMock from "fetch-mock";

import type { ModelCacheRefreshStatus } from "metabase-types/api";

export function setupModelPersistenceEndpoints(
  persistedModel: ModelCacheRefreshStatus,
) {
  fetchMock.get(
    `path:/api/persist/card/${persistedModel.card_id}`,
    persistedModel,
  );
  fetchMock.post(
    `path:/api/card/${persistedModel.card_id}/refresh`,
    persistedModel,
  );
}
