import fetchMock from "fetch-mock";

import type { CardId, ModelIndex } from "metabase-types/api";
import { createMockModelIndex } from "metabase-types/api/mocks";

export function setupModelIndexEndpoints(
  modelId: CardId,
  indexes: ModelIndex[] = [],
) {
  fetchMock.get(
    {
      url: `path:/api/model-index`,
      query: { model_id: modelId },
      overwriteRoutes: false,
    },
    indexes,
    { name: `getModelIndexes-${modelId}` },
  );

  indexes.forEach(index => {
    fetchMock.delete(`path:/api/model-index/${index.id}`, 200, {
      name: `deleteModelIndex`,
    });
  });

  fetchMock.post(
    `path:/api/model-index`,
    async url => {
      const lastCall = fetchMock.lastCall(url);
      return createMockModelIndex(await lastCall?.request?.json());
    },
    { name: `createModelIndex` },
  );
}
