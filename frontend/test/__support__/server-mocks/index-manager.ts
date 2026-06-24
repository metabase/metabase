import fetchMock from "fetch-mock";

import type { TableIndex, TransformId } from "metabase-types/api";
import { createMockTableIndex } from "metabase-types/api/mocks";

export function setupTableIndexEndpoints(
  transformId: TransformId,
  indexes: TableIndex[] = [],
) {
  fetchMock.get({
    url: `path:/api/indexes`,
    query: { "transform-id": transformId },
    response: { data: indexes },
    name: `listTableIndexes-${transformId}`,
  });

  indexes.forEach((index) => {
    fetchMock.get(`path:/api/indexes/${index.id}`, index, {
      name: `getTableIndex-${index.id}`,
    });
    fetchMock.delete(`path:/api/indexes/${index.id}`, 204, {
      name: `deleteTableIndex-${index.id}`,
    });
  });

  fetchMock.post(
    `path:/api/indexes`,
    async (call) => {
      const lastCall = fetchMock.callHistory.lastCall(call.url);
      return createMockTableIndex(await lastCall?.request?.json());
    },
    { name: `createTableIndex` },
  );
}
