import fetchMock from "fetch-mock";

import type {
  CardId,
  DashCardId,
  DashboardId,
  GetPublicAction,
  ParametersForActionExecution,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";
import {
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

export function setupActionEndpoints(action: WritebackAction) {
  const getName = `action-${action.id}-get`;
  const putName = `action-${action.id}-put`;

  fetchMock.get(`path:/api/action/${action.id}`, action, { name: getName });
  fetchMock.put(`path:/api/action/${action.id}`, action, { name: putName });
  fetchMock.delete(`path:/api/action/${action.id}`, action);
}

function setupActionPostEndpoint() {
  fetchMock.post(
    "path:/api/action",
    async (call) => {
      const data = await call?.request?.json();
      if (data.type === "implicit") {
        return createMockImplicitQueryAction(data);
      }
      if (data.type === "query") {
        return createMockQueryAction(data);
      }
      throw new Error(`Unknown action type: ${data.type}`);
    },
    { name: "action-post" },
  );
}

export function setupActionsEndpoints(actions: WritebackAction[]) {
  fetchMock.get("path:/api/action", actions);

  setupActionPostEndpoint();

  actions.forEach((action) => setupActionEndpoints(action));
}

export function setupModelActionsEndpoints(
  actions: WritebackAction[],
  modelId: CardId,
) {
  fetchMock.get({
    url: "path:/api/action",
    query: { "model-id": modelId },
    response: actions,
  });

  setupActionPostEndpoint();

  actions.forEach((action) => setupActionEndpoints(action));
}

export function setupListPublicActionsEndpoint(
  publicActions: GetPublicAction[],
) {
  fetchMock.get("path:/api/action/public", publicActions);
}

export function setupPrefetchActionValuesEndpoint(
  actionId: WritebackActionId,
  values: ParametersForActionExecution,
) {
  fetchMock.post(`path:/api/action/${actionId}/execute/values`, values);
}

export function setupPrefetchDashcardValuesEndpoint(
  dashboardId: DashboardId,
  dashcardId: DashCardId,
  values: ParametersForActionExecution,
) {
  fetchMock.post(
    `path:/api/dashboard/${dashboardId}/dashcard/${dashcardId}/execute/values`,
    values,
  );
}
