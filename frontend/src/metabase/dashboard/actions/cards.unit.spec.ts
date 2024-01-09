import type { Store } from "@reduxjs/toolkit";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import {
  setupCardsEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";

import { checkNotNull } from "metabase/lib/types";

import type { CardId, DashCardId, DashboardCard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockCard,
  createMockHeadingDashboardCard,
  createMockLinkDashboardCard,
  createMockTextDashboardCard,
  createMockParameter,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import type { State } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import { CardApi } from "metabase/services";
import mainReducers from "metabase/reducers-main";

import { getDashCardById } from "../selectors";
import { replaceCard } from "./cards";

const DATE_PARAMETER = createMockParameter({
  id: "1",
  name: "Created At",
  type: "date/all-options",
});

const NUMERIC_PARAMETER = createMockParameter({
  id: "2",
  name: "Discount",
  type: "number/=",
});

const UNUSED_PARAMETER = createMockParameter({
  id: "3",
  name: "Not mapped to anything",
});

const dataset_query = createMockStructuredDatasetQuery({
  query: { "source-table": ORDERS_ID },
});

const ORDERS_TABLE_CARD = createMockCard({ id: 1, dataset_query });
const ORDERS_LINE_CHART_CARD = createMockCard({
  id: 2,
  display: "line",
  dataset_query,
});
const ORDERS_PIE_CHART_CARD = createMockCard({
  id: 3,
  display: "pie",
  dataset_query,
});

const TABLE_DASHCARD = createMockDashboardCard({
  id: 1,
  card_id: ORDERS_TABLE_CARD.id,
  card: ORDERS_TABLE_CARD,
});

// For testing parameters auto-wiring
const PIE_CHART_DASHCARD = createMockDashboardCard({
  id: 2,
  card_id: ORDERS_PIE_CHART_CARD.id,
  card: ORDERS_PIE_CHART_CARD,
  parameter_mappings: [
    {
      card_id: ORDERS_TABLE_CARD.id,
      parameter_id: "1",
      target: [
        "dimension",
        ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
      ],
    },
    {
      card_id: ORDERS_TABLE_CARD.id,
      parameter_id: "2",
      target: [
        "dimension",
        ["field", ORDERS.DISCOUNT, { "base-type": "type/Float" }],
      ],
    },
  ],
});

const HEADING_DASHCARD = createMockHeadingDashboardCard({ id: 3 });
const TEXT_DASHCARD = createMockTextDashboardCard({ id: 4 });
const LINK_DASHCARD = createMockLinkDashboardCard({ id: 5 });

const DASHCARDS = [
  TABLE_DASHCARD,
  HEADING_DASHCARD,
  TEXT_DASHCARD,
  LINK_DASHCARD,
];

const DASHBOARD = createMockDashboard({
  id: 1,
  dashcards: DASHCARDS,
  parameters: [DATE_PARAMETER, NUMERIC_PARAMETER, UNUSED_PARAMETER],
});

type RunActionOpts = {
  dashcardId: DashCardId;
  nextCardId: CardId;
  dashcards?: DashboardCard[];
};

async function runAction({
  dashcardId,
  nextCardId,
  dashcards = DASHCARDS,
}: RunActionOpts) {
  const dashboardState = createMockDashboardState({
    dashboardId: DASHBOARD.id,
    dashboards: {
      [DASHBOARD.id]: { ...DASHBOARD, dashcards: dashcards.map(dc => dc.id) },
    },
    isEditing: DASHBOARD,
    dashcards: _.indexBy(dashcards, "id"),
  });

  // @ts-expect-error we need better redux test tooling
  const store = getStore(
    mainReducers,
    createMockState({ dashboard: dashboardState }),
  ) as Store<State>;

  setupCardsEndpoints([ORDERS_TABLE_CARD, ORDERS_LINE_CHART_CARD]);
  setupCardQueryEndpoints(ORDERS_TABLE_CARD, createMockDataset());
  setupCardQueryEndpoints(ORDERS_LINE_CHART_CARD, createMockDataset());
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
        nextCardId: ORDERS_LINE_CHART_CARD.id,
      });

      expect(nextDashCard).toStrictEqual({
        ...TABLE_DASHCARD,
        card_id: ORDERS_LINE_CHART_CARD.id,
        card: ORDERS_LINE_CHART_CARD,

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
        nextCardId: ORDERS_LINE_CHART_CARD.id,
      });

      // It's important to ensure the `/card/:id/query` endpoint is called
      // Regular dashcard query endpoint won't work with a new `card_id`
      expect(cardQueryEndpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardId: DASHBOARD.id,
          dashcardId: TABLE_DASHCARD.id,
          cardId: ORDERS_LINE_CHART_CARD.id,
          parameters: [],
        }),
        expect.anything(), // abort signal
      );
    });

    it("should auto-wire parameters", async () => {
      const nextCardId = ORDERS_LINE_CHART_CARD.id;
      const otherCardParameterMappings = checkNotNull(
        PIE_CHART_DASHCARD.parameter_mappings,
      );
      const expectedParameterMappings = otherCardParameterMappings.map(
        mapping => ({
          ...mapping,
          card_id: nextCardId,
        }),
      );

      const { nextDashCard } = await runAction({
        dashcardId: TABLE_DASHCARD.id,
        nextCardId: nextCardId,
        dashcards: [...DASHCARDS, PIE_CHART_DASHCARD],
      });

      expect(nextDashCard.parameter_mappings).toEqual(
        expectedParameterMappings,
      );
    });

    it.each([
      ["heading", HEADING_DASHCARD],
      ["text", TEXT_DASHCARD],
      ["link", LINK_DASHCARD],
    ])("should ignore %s dashboard cards", async (_, dashcard) => {
      const { nextDashCard, dispatchSpy } = await runAction({
        dashcardId: dashcard.id,
        nextCardId: ORDERS_LINE_CHART_CARD.id,
      });

      expect(nextDashCard).toEqual(dashcard);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
