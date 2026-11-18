import fetchMock from "fetch-mock";

import type { ReferencedEntitiesResults } from "metabase-types/api";

import type { MockResponse } from "./types";

type StatusCode = number;

export function setupGoalValuesEndpoint(
  response: MockResponse<ReferencedEntitiesResults | StatusCode> = {},
) {
  fetchMock.post("path:/api/dynamic-goal/values", response, {
    name: "goal-values",
  });
}

export function setupPublicCardGoalValuesEndpoint(
  uuid: string,
  response: MockResponse<ReferencedEntitiesResults>,
) {
  fetchMock.get(`path:/api/public/card/${uuid}/goal-values`, response);
}
