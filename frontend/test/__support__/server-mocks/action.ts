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

function setupActionPostEndpoint() {
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
}

export function setupActionsEndpoints(actions: WritebackAction[]) {
  fetchMock.get("path:/api/action", actions);

  setupActionPostEndpoint();

  actions.forEach(action => setupActionEndpoints(action));
}

export function setupModelActionsEndpoints(
  actions: WritebackAction[],
  modelId: CardId,
) {
  fetchMock.get(
    {
      url: "path:/api/action",
      query: { "model-id": modelId },
      overwriteRoutes: false,
    },
    actions,
  );

  setupActionPostEndpoint();

  actions.forEach(action => setupActionEndpoints(action));
}
