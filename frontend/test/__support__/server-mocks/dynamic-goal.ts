import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type { ReferencedEntitiesResults } from "metabase-types/api";

import type { MockResponse } from "./types";

export function setupGoalValuesEndpoint(
  response: MockResponse<ReferencedEntitiesResults | Response> = {},
  options?: UserRouteConfig,
) {
  fetchMock.post("path:/api/dynamic-goal/values", response, {
    name: "dynamic-goal-values",
    ...options,
  });
}
