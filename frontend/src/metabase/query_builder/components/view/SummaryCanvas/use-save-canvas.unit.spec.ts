import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupDashboardEndpoints,
  setupDashboardNotFoundEndpoint,
  setupUpdateCardEndpointWithError,
} from "__support__/server-mocks";
import { act, renderHookWithProviders } from "__support__/ui";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import { PRODUCTS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { createBlock } from "./blocks";
import type { SummaryBlock } from "./types";
import { getSavedDashcards, useSaveSummaryCanvas } from "./use-save-canvas";
import { getSummaryBase } from "./utils";

const DASHBOARD_ID = 10;
const SAVED_CARD_ID = 5;

function createDataQuestion() {
  return new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID },
      },
    }),
    SAMPLE_METADATA,
  );
}

interface SetupOpts {
  dashboard?: Dashboard;
  isDashboardMissing?: boolean;
}

function setup({
  dashboard = createMockDashboard({ id: DASHBOARD_ID }),
  isDashboardMissing = false,
}: SetupOpts = {}) {
  if (isDashboardMissing) {
    setupDashboardNotFoundEndpoint(dashboard);
  } else {
    setupDashboardEndpoints(dashboard);
  }
  setupCardCreateEndpoint();
  setupUpdateCardEndpointWithError(SAVED_CARD_ID);

  const dataQuestion = createDataQuestion();
  const base = getSummaryBase(dataQuestion.query());
  const { result } = renderHookWithProviders(() => useSaveSummaryCanvas(), {});

  const save = (blocks: SummaryBlock[]) =>
    act(() =>
      result.current.save({
        dashboard,
        dataQuestion,
        base,
        blocks,
        removedCardIds: [],
      }),
    );

  return { base, save };
}

function getCreateCardCalls() {
  return fetchMock.callHistory.calls("path:/api/card", { method: "POST" });
}

function getDashboardUpdate(): unknown {
  const call = fetchMock.callHistory.lastCall(
    `path:/api/dashboard/${DASHBOARD_ID}`,
    { method: "PUT" },
  );
  const body = call?.options?.body;
  if (typeof body !== "string") {
    throw new Error("expected a string request body");
  }
  const update: unknown = JSON.parse(body);
  return update;
}

describe("getSavedDashcards", () => {
  it("lays out the canvas's cards and leaves the rest of the dashboard alone", () => {
    const canvasCard = createMockDashboardCard({
      id: 1,
      card_id: 100,
      col: 0,
      row: 0,
    });
    const otherCard = createMockDashboardCard({ id: 2, card_id: 200, row: 9 });
    const textCard = createMockVirtualDashCard({ id: 3, row: 12 });
    const removedCard = createMockDashboardCard({ id: 4, card_id: 300 });

    const dashcards = getSavedDashcards(
      [canvasCard, otherCard, textCard, removedCard],
      new Map([[100, { x: 12, y: 2, w: 6, h: 4 }]]),
      [300],
    );

    expect(dashcards).toEqual([
      { ...canvasCard, col: 12, row: 2, size_x: 6, size_y: 4 },
      otherCard,
      textCard,
    ]);
  });
});

describe("useSaveSummaryCanvas", () => {
  it("creates a card for each block and keeps the dashboard's tabs", async () => {
    const tabs = [
      createMockDashboardTab({ id: 1, dashboard_id: DASHBOARD_ID }),
    ];
    const { base, save } = setup({
      dashboard: createMockDashboard({ id: DASHBOARD_ID, tabs }),
    });

    const result = await save([createBlock(base, [])]);

    expect(result).toMatchObject({
      status: "saved",
      failedCount: 0,
      skippedCount: 0,
      isLayoutSaved: true,
    });
    expect(getCreateCardCalls()).toHaveLength(1);
    expect(getDashboardUpdate()).toMatchObject({ tabs });
  });

  it("saves a block as a new card when its saved card can't be updated", async () => {
    const { base, save } = setup();
    const block = { ...createBlock(base, []), cardId: SAVED_CARD_ID };

    const result = await save([block]);

    expect(result).toMatchObject({ status: "saved", failedCount: 0 });
    expect(getCreateCardCalls()).toHaveLength(1);
  });

  it("leaves empty blocks alone instead of failing", async () => {
    const { base, save } = setup();
    const emptyBlock = { ...createBlock(base, []), values: [] };

    const result = await save([emptyBlock]);

    expect(result).toMatchObject({ status: "saved", skippedCount: 1 });
    expect(getCreateCardCalls()).toHaveLength(0);
  });

  it("saves nothing when the dashboard is gone", async () => {
    const { base, save } = setup({ isDashboardMissing: true });

    const result = await save([createBlock(base, [])]);

    expect(result).toEqual({ status: "dashboard-missing" });
    expect(getCreateCardCalls()).toHaveLength(0);
  });
});
