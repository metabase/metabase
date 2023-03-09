import fetchMock from "fetch-mock";
import type { CardId, WritebackAction } from "metabase-types/api";
import {
  createMockQueryAction,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

export function setupActionEndpoints(action: WritebackAction) {
  fetchMock.get(`path:/api/action/${action.id}`, action);
  fetchMock.put(`path:/api/action/${action.id}`, action);
  fetchMock.delete(`path:/api/action/${action.id}`, action);
}

export function setupActionsEndpoints(
  actions: WritebackAction[],
  modelId?: CardId,
) {
  if (modelId) {
    fetchMock.get(
      {
        url: "path:/api/action",
        query: { "model-id": modelId },
        overwriteRoutes: false,
      },
      actions,
    );
  } else {
    fetchMock.get(
      {
        url: "path:/api/action",
        overwriteRoutes: false,
      },
      actions,
    );
  }

  fetchMock.post(
    { url: "path:/api/action", overwriteRoutes: true },
    async url => {
      const call = fetchMock.lastCall(url);
      const data = await call?.request?.json();
      if (data.type === "implicit") {
        return createMockImplicitQueryAction(data);
      }
      if (data.type === "query") {
        return createMockQueryAction(data);
      }
      throw new Error(`Unknown action type: ${data.type}`);
    },
  );

  actions.forEach(action => setupActionEndpoints(action));
}
