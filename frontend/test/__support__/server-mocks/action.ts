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
  modelId: CardId,
  actions: WritebackAction[],
) {
  fetchMock.get(
    {
      url: "path:/api/action",
      query: { "model-id": modelId },
    },
    actions,
  );

  fetchMock.post("path:/api/action", async (uri, request) => {
    const body = await request.body;
    const data = typeof body === "string" ? JSON.parse(body) : body;
    if (data.type === "implicit") {
      return createMockImplicitQueryAction(data);
    }
    if (data.type === "query") {
      return createMockQueryAction(data);
    }
    throw new Error(`Unknown action type: ${data.type}`);
  });

  actions.forEach(action => setupActionEndpoints(action));
}
