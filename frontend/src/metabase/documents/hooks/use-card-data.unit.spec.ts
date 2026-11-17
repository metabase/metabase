import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupGoalValuesEndpoint,
} from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import type {
  Card,
  ReferencedEntitiesResults,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";

import { useCardData } from "./use-card-data";

const GOAL_SETTINGS: VisualizationSettings = {
  "gauge.segments": [
    { min: 0, max: { type: "card", id: 9, column: "total" }, color: "red" },
  ],
};

const GOAL_CARD = createMockCard({
  id: 1,
  display: "gauge",
  visualization_settings: GOAL_SETTINGS,
});

const GOAL_VALUES = createMockReferencedEntitiesResults({
  column: "total",
  value: 250,
});

type SetupOpts = {
  card: Card;
};

function setup({ card }: SetupOpts) {
  setupCardEndpoints(card);
  setupCardQueryEndpoints(
    card,
    createMockDataset({ data: createMockDatasetData({ rows: [[10]] }) }),
  );

  return renderHookWithProviders(() => useCardData({ id: card.id }), {});
}

describe("useCardData", () => {
  it("returns the card's dataset with its goal values", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { result } = setup({ card: GOAL_CARD });

    await waitFor(() =>
      expect(result.current.dataset?.data.referenced_entities).toEqual(
        GOAL_VALUES,
      ),
    );
    expect(result.current.series?.[0].data.referenced_entities).toEqual(
      GOAL_VALUES,
    );
    expect(await getLastGoalValuesRequestBody()).toEqual({
      sources: [{ type: "card", id: 9, columns: ["total"] }],
    });
  });

  it("keeps loading until the goal values load", async () => {
    const goalValues = defer<ReferencedEntitiesResults>();
    setupGoalValuesEndpoint(() => goalValues.promise);
    const { result } = setup({ card: GOAL_CARD });

    // the card query is in, so only the goal values keep it loading
    await waitFor(() => expect(result.current.regularDataset).toBeDefined());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.series).toBeNull();

    goalValues.resolve(GOAL_VALUES);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.series?.[0].data.referenced_entities).toEqual(
      GOAL_VALUES,
    );
  });

  it("reports every goal source as failed when the goal values fail to load", async () => {
    setupGoalValuesEndpoint(500);
    const { result } = setup({ card: GOAL_CARD });

    await waitFor(() =>
      expect(result.current.dataset?.data.referenced_entities).toEqual({
        card: { 9: { status: "failed" } },
        measure: {},
      }),
    );
  });

  it("does not fetch goal values for a card without dynamic goals", async () => {
    setupGoalValuesEndpoint(GOAL_VALUES);
    const { result } = setup({
      card: createMockCard({ id: 1, display: "table" }),
    });

    await waitFor(() => expect(result.current.series).not.toBeNull());
    expect(result.current.dataset?.data.referenced_entities).toBeUndefined();
    expect(fetchMock.callHistory.called("path:/api/dynamic-goal/values")).toBe(
      false,
    );
  });
});

async function getLastGoalValuesRequestBody(): Promise<unknown> {
  const call = fetchMock.callHistory.lastCall("path:/api/dynamic-goal/values");
  return call?.request?.json();
}
