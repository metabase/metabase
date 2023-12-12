import type { Store } from "@reduxjs/toolkit";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import {
  setupCardsEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import {
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockCard,
  createMockHeadingDashboardCard,
  createMockLinkDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import type { State } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import { CardApi } from "metabase/services";
import mainReducers from "metabase/reducers-main";

import { getDashCardById } from "../selectors";
import { replaceCard } from "./cards";

const TABLE_CARD = createMockCard({ id: 1 });
const CHART_CARD = createMockCard({ id: 2, display: "line" });

const TABLE_DASHCARD = createMockDashboardCard({
  id: 1,
  card_id: TABLE_CARD.id,
  card: TABLE_CARD,
});

const HEADING_DASHCARD = createMockHeadingDashboardCard({ id: 2 });
const TEXT_DASHCARD = createMockTextDashboardCard({ id: 3 });
const LINK_DASHCARD = createMockLinkDashboardCard({ id: 4 });

const DASHCARDS = [
  TABLE_DASHCARD,
  HEADING_DASHCARD,
  TEXT_DASHCARD,
  LINK_DASHCARD,
];

const DASHBOARD = createMockDashboard({
  id: 1,
  dashcards: DASHCARDS,
  parameters: [],
});

async function runAction({
  dashcardId,
  nextCardId,
}: {
  dashcardId: number;
  nextCardId: number;
}) {
  const dashboardState = createMockDashboardState({
    dashboardId: DASHBOARD.id,
    dashboards: { [DASHBOARD.id]: { ...DASHBOARD, dashcards: [] } },
    dashcards: _.indexBy(DASHCARDS, "id"),
  });

  // @ts-expect-error we need better redux test tooling
  const store = getStore(
    mainReducers,
    createMockState({ dashboard: dashboardState }),
  ) as Store<State>;

  setupCardsEndpoints([TABLE_CARD, CHART_CARD]);
  setupCardQueryEndpoints(TABLE_CARD, createMockDataset());
  setupCardQueryEndpoints(CHART_CARD, createMockDataset());
  setupDatabasesEndpoints([createSampleDatabase()]);

  await replaceCard({ dashcardId, nextCardId })(store.dispatch, store.getState);
  const nextState = store.getState();

  const dispatchSpy = jest.spyOn(store, "dispatch");
  const cardQueryEndpointSpy = jest.spyOn(CardApi, "query");

  return {
    nextDashCard: getDashCardById(nextState, dashcardId),
    dispatchSpy,
    cardQueryEndpointSpy,
  };
}

describe("dashboard/actions/cards", () => {
  describe("replaceCard", () => {
    it("should correctly update the dashcard", async () => {
      const { nextDashCard } = await runAction({
        dashcardId: TABLE_DASHCARD.id,
        nextCardId: CHART_CARD.id,
      });

      expect(nextDashCard).toStrictEqual({
        ...TABLE_DASHCARD,
        card_id: CHART_CARD.id,
        card: CHART_CARD,

        // Ensure it resets attributes that
        // no longer make sense with a new card
        series: [],
        parameter_mappings: [],
        visualization_settings: {},

        // Internal state
        isDirty: true,
      });
    });

    it("should run a new card query", async () => {
      const { cardQueryEndpointSpy } = await runAction({
        dashcardId: TABLE_DASHCARD.id,
        nextCardId: CHART_CARD.id,
      });

      // It's important to ensure the `/card/:id/query` endpoint is called
      // Regular dashcard query endpoint won't work with a new `card_id`
      expect(cardQueryEndpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardId: DASHBOARD.id,
          dashcardId: TABLE_DASHCARD.id,
          cardId: CHART_CARD.id,
          parameters: [],
        }),
        expect.anything(), // abort signal
      );
    });

    it.each([
      ["heading", HEADING_DASHCARD],
      ["text", TEXT_DASHCARD],
      ["link", LINK_DASHCARD],
    ])("should ignore %s dashboard cards", async (_, dashcard) => {
      const { nextDashCard, dispatchSpy } = await runAction({
        dashcardId: dashcard.id,
        nextCardId: CHART_CARD.id,
      });

      expect(nextDashCard).toEqual(dashcard);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
