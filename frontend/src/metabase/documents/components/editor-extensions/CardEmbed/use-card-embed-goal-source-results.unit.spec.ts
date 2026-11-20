import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders } from "__support__/ui";
import { dynamicGoalApi } from "metabase/api/dynamic-goal";
import type { GoalCard } from "metabase/viz-core";
import type { GoalSourcesScope } from "metabase-types/api";

import { useCardEmbedGoalSourceResults } from "./use-card-embed-goal-source-results";

const GOAL_SOURCE_RESULTS_URL = "path:/api/dynamic-goal/values";

const SCOPE: GoalSourcesScope = { type: "signed-in" };

const CARD: GoalCard = {
  display: "gauge",
  visualization_settings: {
    "gauge.segments": [
      { min: 0, max: { type: "card", id: 9, column: "total" }, color: "red" },
    ],
  },
};

type SetupStore = ReturnType<typeof setup>["store"];

type SetupOpts = {
  datasetFetchStartedAt?: number;
  skip?: boolean;
};

function setup({ datasetFetchStartedAt, skip = false }: SetupOpts = {}) {
  setupGoalSourceResultsEndpoint({});

  return renderHookWithProviders(useCardEmbedGoalSourceResults, {
    initialProps: { card: CARD, datasetFetchStartedAt, scope: SCOPE, skip },
  });
}

describe("useCardEmbedGoalSourceResults", () => {
  it("fetches the goal source results of the card", async () => {
    setup();

    await waitFor(() => expect(getGoalSourceCalls()).toHaveLength(1));
  });

  it("does not fetch the goal source results again when the card query reuses its result", async () => {
    const { rerender, store } = setup({ datasetFetchStartedAt: 1000 });
    await waitForGoalSourceResultsToLoad(store);

    rerender({
      card: { ...CARD },
      datasetFetchStartedAt: 1000,
      scope: SCOPE,
      skip: false,
    });
    await waitForGoalSourceResultsToLoad(store);

    expect(getGoalSourceCalls()).toHaveLength(1);
  });

  it("fetches the goal source results again when the card query runs again", async () => {
    const { rerender, store } = setup({ datasetFetchStartedAt: 1000 });
    await waitForGoalSourceResultsToLoad(store);

    rerender({
      card: CARD,
      datasetFetchStartedAt: 2000,
      scope: SCOPE,
      skip: false,
    });

    await waitFor(() => expect(getGoalSourceCalls()).toHaveLength(2));
  });

  it("fetches the goal source results again when the card query runs again with other arguments", async () => {
    const { rerender, store } = setup({ datasetFetchStartedAt: 1000 });
    await waitForGoalSourceResultsToLoad(store);

    rerender({
      card: CARD,
      datasetFetchStartedAt: undefined,
      scope: SCOPE,
      skip: false,
    });
    rerender({
      card: CARD,
      datasetFetchStartedAt: 2000,
      scope: SCOPE,
      skip: false,
    });

    await waitFor(() => expect(getGoalSourceCalls()).toHaveLength(2));
  });

  it("does not fetch the goal source results again when the card query runs for the first time", async () => {
    const { rerender, store } = setup();
    await waitForGoalSourceResultsToLoad(store);

    rerender({
      card: CARD,
      datasetFetchStartedAt: 1000,
      scope: SCOPE,
      skip: false,
    });
    await waitForGoalSourceResultsToLoad(store);

    expect(getGoalSourceCalls()).toHaveLength(1);
  });

  it("does not fetch the goal source results again when the card query reuses an older result", async () => {
    const { rerender, store } = setup({ datasetFetchStartedAt: 2000 });
    await waitForGoalSourceResultsToLoad(store);

    rerender({
      card: CARD,
      datasetFetchStartedAt: 1000,
      scope: SCOPE,
      skip: false,
    });
    await waitForGoalSourceResultsToLoad(store);

    expect(getGoalSourceCalls()).toHaveLength(1);
  });

  it("does not fetch the goal source results while skipped", () => {
    const { store } = setup({ skip: true });

    expect(getGoalSourceResultsState(store).isUninitialized).toBe(true);
    expect(getGoalSourceCalls()).toHaveLength(0);
  });
});

function getGoalSourceCalls() {
  return fetchMock.callHistory.calls(GOAL_SOURCE_RESULTS_URL);
}

async function waitForGoalSourceResultsToLoad(store: SetupStore) {
  await waitFor(() =>
    expect(getGoalSourceResultsState(store).isSuccess).toBe(true),
  );
}

function getGoalSourceResultsState(store: SetupStore) {
  return dynamicGoalApi.endpoints.getGoalSourceResults.select({
    ...SCOPE,
    sources: [{ type: "card", id: 9 }],
  })(store.getState());
}
