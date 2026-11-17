import type { Store } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { getMainStore } from "__support__/entities-store";
import {
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { setupDashcardQueryEndpoints } from "__support__/server-mocks/dashcard";
import { createMockDashboardState, createMockState } from "__support__/state";
import { waitFor } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import type { State, StoreDashcard } from "metabase/redux/store";
import { performUndo } from "metabase/redux/undo";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  CardId,
  DashCardId,
  Dashboard,
  DashboardTabId,
  QuestionDashboardCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockDataset,
  createMockHeadingDashboardCard,
  createMockLinkDashboardCard,
  createMockParameter,
  createMockPlaceholderDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";
import { ORDERS, createSampleDatabase } from "metabase-types/api/mocks/presets";

import type { SectionLayout } from "../sections";
import { layoutOptions } from "../sections";
import { getDashCardById, getDashboardById, getDashcards } from "../selectors";

import type { AddCardToDashboardOpts } from "./cards-typed";
import {
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addSectionToDashboard,
  duplicateCard,
  removeCardFromDashboard,
  replaceCard,
} from "./cards-typed";
import { fetchCardData } from "./data-fetching";

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

const dataset_query = Lib.toJsQuery(
  Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
);

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
const TEST_DB = createSampleDatabase();

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
  dashcards: DASHCARDS.map((dc) => ({ ...dc, dashboard_tab_id: 1 })),
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
  setupDatabasesEndpoints([TEST_DB]);
  setupCardsEndpoints([ORDERS_TABLE_CARD, ORDERS_LINE_CHART_CARD]);
  setupCardQueryEndpoints(ORDERS_TABLE_CARD, createMockDataset());
  setupCardQueryMetadataEndpoint(
    ORDERS_TABLE_CARD,
    createMockCardQueryMetadata({ databases: [TEST_DB] }),
  );
  setupCardQueryEndpoints(ORDERS_LINE_CHART_CARD, createMockDataset());
  setupCardQueryMetadataEndpoint(
    ORDERS_LINE_CHART_CARD,
    createMockCardQueryMetadata({ databases: [TEST_DB] }),
  );

  const dashboardState = createMockDashboardState({
    dashboardId: dashboard.id,
    dashboards: {
      [dashboard.id]: { ...dashboard, dashcards: dashcards.map((dc) => dc.id) },
    },
    editingDashboard: DASHBOARD,
    dashcards: _.indexBy(dashcards, "id"),
  });

  // Unjustified type cast. FIXME
  const store = getMainStore(
    createMockState({ dashboard: dashboardState }),
  ) as Store<State>;

  return { store };
}

describe("dashboard/actions/cards", () => {
  describe("addSectionToDashboard", () => {
    layoutOptions.forEach((sectionLayout) => {
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

        afterEach(() => {
          jest.restoreAllMocks();
        });

        it("should track the added section layout", () => {
          const trackSchemaEvent = jest
            .spyOn(Analytics, "trackSchemaEvent")
            .mockClear();

          runAddSectionAction({ dashcards: [], sectionLayout });

          expect(trackSchemaEvent.mock.calls).toEqual([
            [
              "dashboard",
              {
                event: "dashboard_section_added",
                dashboard_id: DASHBOARD.id,
                section_layout: sectionLayout.id,
              },
            ],
          ]);
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
            (dc) => dc.dashboard_tab_id === tabId,
          );
          expect(tabDashcards).toHaveLength(layoutItems.length);
        });
      });
    });
  });

  describe.each([
    {
      display: "text",
      event: "new_text_card_created",
      addCard: addMarkdownDashCardToDashboard,
    },
    {
      display: "heading",
      event: "new_heading_card_created",
      addCard: addHeadingDashCardToDashboard,
    },
  ])("adding a $display card", ({ display, event, addCard }) => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should add a just-added virtual card and track it", () => {
      const trackSchemaEvent = jest
        .spyOn(Analytics, "trackSchemaEvent")
        .mockClear();
      const { store } = setup();

      addCard({ dashId: DASHBOARD.id, tabId: null })(store.dispatch);

      const existingIds = DASHCARDS.map((dashcard) => dashcard.id);
      const newDashcards = Object.values(getDashcards(store.getState())).filter(
        (dashcard) => !existingIds.includes(dashcard.id),
      );
      expect(newDashcards).toHaveLength(1);
      expect(newDashcards[0]).toMatchObject({
        card: { display },
        justAdded: true,
      });
      expect(trackSchemaEvent.mock.calls).toEqual([
        ["dashboard", { event, dashboard_id: DASHBOARD.id }],
      ]);
    });
  });

  describe("removeCardFromDashboard", () => {
    const DASHCARD_QUERY_PATH = `path:/api/dashboard/${DASHBOARD.id}/dashcard/${TABLE_DASHCARD.id}/card/${ORDERS_TABLE_CARD.id}/query`;

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should cancel the running query of a removed card and re-run it on undo (metabase#12926)", async () => {
      const abort = jest.spyOn(AbortController.prototype, "abort");
      const dataset = createMockDataset();
      const { store } = setup();
      setupDashcardQueryEndpoints(DASHBOARD.id, TABLE_DASHCARD, dataset, {
        delay: 100,
      });

      const initialFetch = fetchCardData(
        ORDERS_TABLE_CARD,
        TABLE_DASHCARD,
      )(store.dispatch);
      await waitFor(() =>
        expect(fetchMock.callHistory.calls(DASHCARD_QUERY_PATH)).toHaveLength(
          1,
        ),
      );
      abort.mockClear();

      await removeCardFromDashboard({
        dashcardId: TABLE_DASHCARD.id,
        cardId: ORDERS_TABLE_CARD.id,
      })(store.dispatch, store.getState);
      await initialFetch;

      expect(abort).toHaveBeenCalled();
      expect(
        getDashCardById(store.getState(), TABLE_DASHCARD.id).isRemoved,
      ).toBe(true);
      expect(getCardData(store)).toBeNull();

      performUndo(store.getState().undo[0].id)(store.dispatch, store.getState);

      await waitFor(() =>
        expect(
          getDashCardById(store.getState(), TABLE_DASHCARD.id).isRemoved,
        ).toBe(false),
      );
      await waitFor(() => expect(getCardData(store)).toEqual(dataset));
      expect(fetchMock.callHistory.calls(DASHCARD_QUERY_PATH)).toHaveLength(2);
    });

    it("should restore a removed virtual card on undo without running a query (metabase#35545)", async () => {
      const { store } = setup();

      await removeCardFromDashboard({
        dashcardId: TEXT_DASHCARD.id,
        cardId: TEXT_DASHCARD.card_id,
      })(store.dispatch, store.getState);

      expect(
        getDashCardById(store.getState(), TEXT_DASHCARD.id).isRemoved,
      ).toBe(true);

      const [undo] = store.getState().undo;
      expect(undo.message).toBe("Removed card");
      performUndo(undo.id)(store.dispatch, store.getState);

      await waitFor(() =>
        expect(
          getDashCardById(store.getState(), TEXT_DASHCARD.id),
        ).toMatchObject({ isRemoved: false, card: TEXT_DASHCARD.card }),
      );
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    });

    function getCardData(store: Store<State>) {
      return (
        store.getState().dashboard.dashcardData[TABLE_DASHCARD.id]?.[
          ORDERS_TABLE_CARD.id
        ] ?? null
      );
    }
  });

  describe("replaceCard", () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

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

    it("should run a new card query with dashboard context (UXW-4769)", async () => {
      await runReplaceCardAction({
        dashcardId: TABLE_DASHCARD.id,
        nextCardId: ORDERS_LINE_CHART_CARD.id,
      });

      // It's important to ensure the `/card/:id/query` endpoint is called
      // Regular dashcard query endpoint won't work with a new `card_id`
      const queryCalls = fetchMock.callHistory.calls(
        `path:/api/card/${ORDERS_LINE_CHART_CARD.id}/query`,
      );
      expect(queryCalls).toHaveLength(1);

      const requestBody = queryCalls[0].options.body;
      expect(typeof requestBody).toBe("string");

      if (typeof requestBody !== "string") {
        return;
      }

      const parsedBody: unknown = JSON.parse(requestBody);
      expect(parsedBody).toMatchObject({ dashboard_id: DASHBOARD.id });
    });

    it("should not auto-wire parameters", async () => {
      const nextCardId = ORDERS_LINE_CHART_CARD.id;

      const { nextDashCard } = await runReplaceCardAction({
        dashcardId: TABLE_DASHCARD.id,
        nextCardId: nextCardId,
        dashcards: [...DASHCARDS, PIE_CHART_DASHCARD],
      });

      expect(nextDashCard.parameter_mappings).toEqual([]);
    });
  });

  describe("addCardToDashboard", () => {
    it("should not auto-wire parameters", async () => {
      const { nextDashCard } = await runAddCardToDashboard({
        dashId: DASHBOARD.id,
        cardId: ORDERS_LINE_CHART_CARD.id,
        tabId: null,
        // for auto-wiring
        dashcards: [...DASHCARDS, PIE_CHART_DASHCARD],
      });

      expect(nextDashCard.parameter_mappings).toEqual([]);
    });
  });

  describe("duplicateCard", () => {
    it("should duplicate inline parameters including settings like default and required", async () => {
      const cardParameter = createMockParameter({
        id: "card-filter",
        name: "Card Filter",
        type: "number/=",
        sectionId: "number",
        default: [10],
        required: true,
        isMultiSelect: false,
      });
      const questionDashcard = createMockDashboardCard({
        id: 10,
        card_id: ORDERS_TABLE_CARD.id,
        card: ORDERS_TABLE_CARD,
        inline_parameters: [cardParameter.id],
        parameter_mappings: [
          {
            card_id: ORDERS_TABLE_CARD.id,
            parameter_id: cardParameter.id,
            target: [
              "dimension",
              ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
            ],
          },
        ],
      });
      const dashboard = createMockDashboard({
        id: 1,
        dashcards: [questionDashcard],
        parameters: [cardParameter],
      });

      const { store } = setup({
        dashboard,
        dashcards: [questionDashcard],
      });

      await duplicateCard({ id: questionDashcard.id })(
        store.dispatch,
        store.getState,
      );

      const nextState = store.getState();
      const nextDashboard = getDashboardById(nextState, dashboard.id);
      const duplicatedDashcardId = nextDashboard.dashcards.find(
        (dashcardId) => dashcardId !== questionDashcard.id,
      );
      expect(duplicatedDashcardId).toBeDefined();

      // question is a QuestionDashboardCard
      const duplicatedDashcard = getDashCardById(
        nextState,
        duplicatedDashcardId!,
      ) as QuestionDashboardCard;
      expect(duplicatedDashcard.inline_parameters).toHaveLength(1);

      const newParameterId = duplicatedDashcard.inline_parameters![0];
      expect(newParameterId).not.toBe(cardParameter.id);
      expect(duplicatedDashcard.parameter_mappings).toEqual([
        expect.objectContaining({ parameter_id: newParameterId }),
      ]);

      const newParameter = nextDashboard.parameters?.find(
        (parameter) => parameter.id === newParameterId,
      );
      expect(newParameter).toMatchObject({
        name: "Card Filter 1",
        default: [10],
        required: true,
        isMultiSelect: false,
      });

      // Original card still references the original parameter
      expect(
        // question is a QuestionDashboardCard
        (
          getDashCardById(
            nextState,
            questionDashcard.id,
          ) as QuestionDashboardCard
        ).inline_parameters,
      ).toEqual([cardParameter.id]);
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

  const dispatchSpy = jest.spyOn(store, "dispatch");

  await replaceCard({ dashcardId, nextCardId })(store.dispatch, store.getState);
  const nextState = store.getState();

  return {
    nextDashCard: getDashCardById(nextState, dashcardId),
    dispatchSpy,
  };
}

async function runAddCardToDashboard({
  dashId,
  tabId,
  cardId,
  ...opts
}: SetupOpts & AddCardToDashboardOpts) {
  const { store } = setup(opts);

  await addCardToDashboard({
    dashId,
    tabId,
    cardId,
  })(store.dispatch);
  const nextState = store.getState();

  const tempDashCardId =
    getDashboardById(nextState, dashId).dashcards.find(
      (dashcardId) => dashcardId < 0,
    ) ?? -1;

  return {
    nextDashCard: getDashCardById(nextState, tempDashCardId),
  };
}
