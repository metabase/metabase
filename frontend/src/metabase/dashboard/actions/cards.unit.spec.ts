import type { Store } from "@reduxjs/toolkit";
import _ from "underscore";

import { getStore } from "__support__/entities-store";
import {
  setupCardsEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { checkNotNull } from "metabase/lib/types";
import mainReducers from "metabase/reducers-main";
import { CardApi } from "metabase/services";
import type {
  CardId,
  DashCardId,
  Dashboard,
  DashboardTabId,
} from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockDataset,
  createMockCard,
  createMockHeadingDashboardCard,
  createMockLinkDashboardCard,
  createMockTextDashboardCard,
  createMockParameter,
  createMockStructuredDatasetQuery,
  createMockPlaceholderDashboardCard,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import type { State, StoreDashcard } from "metabase-types/store";
import {
  createMockDashboardState,
  createMockState,
} from "metabase-types/store/mocks";

import type { SectionLayout } from "../sections";
import { layoutOptions } from "../sections";
import { getDashCardById, getDashcards } from "../selectors";

import { addSectionToDashboard, replaceCard } from "./cards-typed";

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
const PLACEHOLDER_DASHCARD = createMockPlaceholderDashboardCard({ id: 6 });

const DASHCARDS = [
  TABLE_DASHCARD,
  HEADING_DASHCARD,
  TEXT_DASHCARD,
  LINK_DASHCARD,
  PLACEHOLDER_DASHCARD,
];

const DASHBOARD = createMockDashboard({
  id: 1,
  dashcards: DASHCARDS,
  parameters: [DATE_PARAMETER, NUMERIC_PARAMETER, UNUSED_PARAMETER],
});

const DASHBOARD_WITH_TABS = createMockDashboard({
  id: 1,
  parameters: [DATE_PARAMETER, NUMERIC_PARAMETER, UNUSED_PARAMETER],
  dashcards: DASHCARDS.map(dc => ({ ...dc, dashboard_tab_id: 1 })),
  tabs: [
    createMockDashboardTab({ id: 1, name: "Tab 1" }),
    createMockDashboardTab({ id: 2, name: "Tab 2" }),
  ],
});

type SetupOpts = {
  dashboard?: Dashboard;
  dashcards?: StoreDashcard[];
};

function setup({
  dashboard = DASHBOARD,
  dashcards = DASHCARDS,
}: SetupOpts = {}) {
  setupCardsEndpoints([ORDERS_TABLE_CARD, ORDERS_LINE_CHART_CARD]);
  setupCardQueryEndpoints(ORDERS_TABLE_CARD, createMockDataset());
  setupCardQueryEndpoints(ORDERS_LINE_CHART_CARD, createMockDataset());
  setupDatabasesEndpoints([createSampleDatabase()]);

  const dashboardState = createMockDashboardState({
    dashboardId: dashboard.id,
    dashboards: {
      [dashboard.id]: { ...dashboard, dashcards: dashcards.map(dc => dc.id) },
    },
    editingDashboard: DASHBOARD,
    dashcards: _.indexBy(dashcards, "id"),
  });

  const store = getStore(
    mainReducers,
    createMockState({ dashboard: dashboardState }),
  ) as Store<State>;

  return { store };
}

describe("dashboard/actions/cards", () => {
  describe("addSectionToDashboard", () => {
    layoutOptions.forEach(sectionLayout => {
      describe(sectionLayout.label, () => {
        const layoutItems = sectionLayout.getLayout({ col: 0, row: 0 });

        it("should add a section", () => {
          const { nextDashcards } = runAddSectionAction({
            dashcards: [],
            sectionLayout,
          });

          expect(nextDashcards).toHaveLength(layoutItems.length);
        });

        it("should add a section to existing dashcards", async () => {
          const { nextDashcards } = runAddSectionAction({
            dashcards: DASHCARDS,
            sectionLayout,
          });

          expect(nextDashcards).toHaveLength(
            DASHCARDS.length + layoutItems.length,
          );
        });

        it("should add a section to specified tab", async () => {
          const tabId = 2;
          const { nextDashcards } = runAddSectionAction({
            dashboard: DASHBOARD_WITH_TABS,
            dashcards: DASHBOARD_WITH_TABS.dashcards,
            tabId,
            sectionLayout,
          });

          const tabDashcards = nextDashcards.filter(
            dc => dc.dashboard_tab_id === tabId,
          );
          expect(tabDashcards).toHaveLength(layoutItems.length);
        });
      });
    });
  });

  describe("replaceCard", () => {
    it("should correctly update the dashcard", async () => {
      const { nextDashCard } = await runReplaceCardAction({
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
      const { cardQueryEndpointSpy } = await runReplaceCardAction({
        dashcardId: TABLE_DASHCARD.id,
        nextCardId: ORDERS_LINE_CHART_CARD.id,
      });

      // It's important to ensure the `/card/:id/query` endpoint is called
      // Regular dashcard query endpoint won't work with a new `card_id`
      expect(cardQueryEndpointSpy).toHaveBeenCalledWith(
        { cardId: ORDERS_LINE_CHART_CARD.id },
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

      const { nextDashCard } = await runReplaceCardAction({
        dashcardId: TABLE_DASHCARD.id,
        nextCardId: nextCardId,
        dashcards: [...DASHCARDS, PIE_CHART_DASHCARD],
      });

      expect(nextDashCard.parameter_mappings).toEqual(
        expectedParameterMappings,
      );
    });
  });
});

type RunAddSectionOpts = SetupOpts & {
  tabId?: DashboardTabId | null;
  sectionLayout: SectionLayout;
};

function runAddSectionAction({
  dashboard = DASHBOARD,
  tabId = null,
  sectionLayout,
  ...opts
}: RunAddSectionOpts) {
  const { store } = setup({ dashboard, ...opts });

  addSectionToDashboard({
    dashId: dashboard.id,
    tabId,
    sectionLayout,
  })(store.dispatch, store.getState);

  const nextState = store.getState();
  const nextDashcards = Object.values(getDashcards(nextState));

  return { nextDashcards };
}

type RunReplaceCardOpts = SetupOpts & {
  dashcardId: DashCardId;
  nextCardId: CardId;
};

async function runReplaceCardAction({
  dashcardId,
  nextCardId,
  ...opts
}: RunReplaceCardOpts) {
  const { store } = setup(opts);

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
