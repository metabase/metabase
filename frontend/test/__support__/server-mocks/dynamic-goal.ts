import fetchMock from "fetch-mock";

import type { CardId, DashCardId, GoalSourceResults } from "metabase-types/api";

import type { MockResponse } from "./types";

type StatusCode = number;

export function setupGoalSourceResultsEndpoint(
  response: MockResponse<GoalSourceResults | StatusCode> = {},
) {
  fetchMock.post("path:/api/dynamic-goal/values", response, {
    name: "goal-source-results",
  });
}

export function setupPublicDashcardGoalSourceResultsEndpoint({
  cardId,
  dashcardId,
  response,
  uuid,
}: {
  cardId: CardId;
  dashcardId: DashCardId;
  response: MockResponse<GoalSourceResults | StatusCode>;
  uuid: string;
}) {
  fetchMock.get(
    `path:/api/public/dashboard/${uuid}/dashcard/${dashcardId}/card/${cardId}/goal-values`,
    response,
    { name: "public-dashcard-goal-source-results" },
  );
}
