import fetchMock from "fetch-mock";

import type { TableIndexRequest, TransformId } from "metabase-types/api";
import { createMockTableIndexRequest } from "metabase-types/api/mocks";

export function setupTableIndexEndpoints(
  transformId: TransformId,
  indexRequests: TableIndexRequest[] = [],
) {
  fetchMock.get({
    url: `path:/api/indexes`,
    query: { "transform-id": transformId },
    response: { data: indexRequests },
    name: `listTableIndexes-${transformId}`,
  });

  indexRequests.forEach((index) => {
    fetchMock.get(`path:/api/indexes/request/${index.id}`, index, {
      name: `getTableIndex-${index.id}`,
    });
    fetchMock.delete(`path:/api/indexes/request/${index.id}`, 204, {
      name: `deleteTableIndex-${index.id}`,
    });
    fetchMock.put(
      `path:/api/indexes/request/${index.id}`,
      async (call) => {
        const lastCall = fetchMock.callHistory.lastCall(call.url);
        return { ...index, ...(await lastCall?.request?.json()) };
      },
      { name: `updateTableIndex-${index.id}` },
    );
  });

  fetchMock.post(
    `path:/api/indexes/request`,
    async (call) => {
      const lastCall = fetchMock.callHistory.lastCall(call.url);
      return createMockTableIndexRequest(await lastCall?.request?.json());
    },
    { name: `createTableIndex` },
  );
}
