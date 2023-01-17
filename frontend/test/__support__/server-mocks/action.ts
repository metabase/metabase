import type { Scope } from "nock";
import type { CardId, WritebackAction } from "metabase-types/api";
import {
  createMockQueryAction,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

export function setupActionEndpoints(scope: Scope, action: WritebackAction) {
  scope.get(`/api/action/${action.id}`).reply(200, action);
  scope.put(`/api/action/${action.id}`).reply(200, action);
}

export function setupActionsEndpoints(
  scope: Scope,
  modelId: CardId,
  actions: WritebackAction[],
) {
  scope.get(`/api/action?model-id=${modelId}`).reply(200, actions);

  scope.post("/api/action").reply(200, (uri, body) => {
    const data = body as WritebackAction;
    if (data.type === "implicit") {
      return createMockImplicitQueryAction(data);
    }
    if (data.type === "query") {
      return createMockQueryAction(data);
    }
    throw new Error(`Unknown action type: ${data.type}`);
  });

  actions.forEach(action => setupActionEndpoints(scope, action));
}
