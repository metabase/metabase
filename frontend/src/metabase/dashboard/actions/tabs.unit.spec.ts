import _ from "underscore";

import { getMainStore } from "__support__/entities-store";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "__support__/state";
import { waitFor } from "__support__/ui";
import type { StoreDashcard } from "metabase/redux/store";
import { performUndo } from "metabase/redux/undo";
import { checkNotNull } from "metabase/utils/types";
import type {
  DashCardDataMap,
  Parameter,
  QuestionDashboardCard,
  VirtualDashboardCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockDataset,
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockParameterMapping,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { ORDERS, ORDERS_ID, PRODUCTS } from "metabase-types/api/mocks/presets";

import { TEST_DASHBOARD_STATE } from "../components/DashboardTabs/test-utils";
import { getDashboard, getDashcards, getTabs } from "../selectors";

import { setDashboardAttributes } from "./core";
import { getIdFromSlug, moveTab, resetTempTabId, tabsReducer } from "./tabs";
import { deleteTab, duplicateTab } from "./tabs-thunks";

const ORDERS_CARD = createMockCard({
  id: 1,
  dataset_query: createMockStructuredDatasetQuery({
    query: { "source-table": ORDERS_ID },
  }),
});

const DASHBOARD_LEVEL_PARAMETER = createMockParameter({
  id: "dashboard-filter",
  name: "Dashboard Filter",
  type: "string/=",
  sectionId: "string",
});

const HEADER_PARAMETER = createMockParameter({
  id: "header-filter",
  name: "Header Filter",
  type: "string/=",
  sectionId: "string",
  default: ["Gadget"],
  required: true,
});

const CARD_PARAMETER = createMockParameter({
  id: "card-filter",
  name: "Card Filter",
  type: "number/=",
  sectionId: "number",
  default: [10],
  required: true,
});

const dimensionTarget = (
  fieldId: number,
): ["dimension", ["field", number, { "base-type": string }]] => [
  "dimension",
  ["field", fieldId, { "base-type": "type/Text" }],
];

/**
 * It's preferred to write tests in `DashboardTabs.unit.spec.tsx`,
 * only write tests here for things that are not easily testable at the component level or in Cypress.
 */
describe("tabsReducer", () => {
  it("should reorder the tabs when MOVE_TAB is dispatched", () => {
    const newDashState = tabsReducer(
      TEST_DASHBOARD_STATE,
      moveTab({ sourceTabId: 1, destinationTabId: 3 }),
    );
    expect(newDashState.dashboards[1].tabs?.map((t) => t.id)).toEqual([
      2, 3, 1,
    ]);
  });
});

describe("getIdFromSlug", () => {
  it("should return the id as a number if slug is valid", () => {
    expect(getIdFromSlug("1-tab-name")).toEqual(1);
    expect(getIdFromSlug("1")).toEqual(1);
  });

  it("should return undefined if slug is invalid", () => {
    expect(getIdFromSlug("1tabname")).toEqual(undefined);
    expect(getIdFromSlug("tab-name")).toEqual(undefined);
  });
});

describe("duplicateTab", () => {
  beforeEach(() => {
    resetTempTabId();
  });

  it("should duplicate header filters with new ids and remapped card mappings (#77002)", () => {
    const headingDashcard = createMockHeadingDashboardCard({
      id: 1,
      dashboard_tab_id: 1,
      inline_parameters: [HEADER_PARAMETER.id],
    });
    const questionDashcard = createMockDashboardCard({
      id: 2,
      dashboard_tab_id: 1,
      card_id: ORDERS_CARD.id,
      card: ORDERS_CARD,
      parameter_mappings: [
        createMockParameterMapping({
          parameter_id: HEADER_PARAMETER.id,
          card_id: ORDERS_CARD.id,
          target: dimensionTarget(PRODUCTS.CATEGORY),
        }),
      ],
    });

    const { store } = setup({
      parameters: [HEADER_PARAMETER],
      dashcards: [headingDashcard, questionDashcard],
    });

    duplicateTab(1)(store.dispatch, store.getState);

    const state = store.getState();
    const dashboard = getDashboard(state);
    const dashcards = Object.values(getDashcards(state));
    const newTabId = -2;

    const duplicatedHeading = dashcards.find(
      (dc) =>
        dc.dashboard_tab_id === newTabId &&
        "inline_parameters" in dc &&
        dc.card.display === "heading",
    );
    const duplicatedQuestion = dashcards.find(
      (dc) => dc.dashboard_tab_id === newTabId && dc.card_id === ORDERS_CARD.id,
    );

    expect(duplicatedHeading).toBeDefined();
    expect(duplicatedQuestion).toBeDefined();

    // heading dashcard is a VirtualDashboardCard
    const newHeaderParameterId = (duplicatedHeading as VirtualDashboardCard)
      .inline_parameters![0];
    expect(newHeaderParameterId).not.toBe(HEADER_PARAMETER.id);

    const newHeaderParameter = dashboard?.parameters?.find(
      (parameter) => parameter.id === newHeaderParameterId,
    );
    expect(newHeaderParameter).toMatchObject({
      name: "Header Filter 1",
      default: ["Gadget"],
      required: true,
    });

    expect(duplicatedQuestion!.parameter_mappings).toEqual([
      expect.objectContaining({
        parameter_id: newHeaderParameterId,
        card_id: ORDERS_CARD.id,
      }),
    ]);

    // Source tab still references the original parameter
    expect(headingDashcard.inline_parameters).toEqual([HEADER_PARAMETER.id]);
    expect(getDashcards(state)[questionDashcard.id].parameter_mappings).toEqual(
      [expect.objectContaining({ parameter_id: HEADER_PARAMETER.id })],
    );
  });

  it("should duplicate card filters independently from the source tab", () => {
    const questionDashcard = createMockDashboardCard({
      id: 1,
      dashboard_tab_id: 1,
      card_id: ORDERS_CARD.id,
      card: ORDERS_CARD,
      inline_parameters: [CARD_PARAMETER.id],
      parameter_mappings: [
        createMockParameterMapping({
          parameter_id: CARD_PARAMETER.id,
          card_id: ORDERS_CARD.id,
          target: dimensionTarget(ORDERS.QUANTITY),
        }),
      ],
    });

    const { store } = setup({
      parameters: [CARD_PARAMETER],
      dashcards: [questionDashcard],
    });

    duplicateTab(1)(store.dispatch, store.getState);

    const state = store.getState();
    const dashboard = getDashboard(state);
    const newTabId = -2;
    // question is a QuestionDashboardCard
    const duplicatedQuestion = Object.values(getDashcards(state)).find(
      (dc) => dc.dashboard_tab_id === newTabId && dc.card_id === ORDERS_CARD.id,
    ) as QuestionDashboardCard;

    expect(duplicatedQuestion).toBeDefined();
    expect(duplicatedQuestion.inline_parameters).toHaveLength(1);

    const newCardParameterId = duplicatedQuestion.inline_parameters![0];
    expect(newCardParameterId).not.toBe(CARD_PARAMETER.id);
    expect(duplicatedQuestion!.parameter_mappings).toEqual([
      expect.objectContaining({ parameter_id: newCardParameterId }),
    ]);

    const newCardParameter = dashboard?.parameters?.find(
      (parameter) => parameter.id === newCardParameterId,
    );
    expect(newCardParameter).toMatchObject({
      name: "Card Filter 1",
      default: [10],
      required: true,
    });

    // Original card still uses the original parameter id
    expect(
      // question is a QuestionDashboardCard
      (getDashcards(state)[questionDashcard.id] as QuestionDashboardCard)
        .inline_parameters,
    ).toEqual([CARD_PARAMETER.id]);
  });

  it("should keep dashboard-level parameter mappings pointing at the original parameter", () => {
    const questionDashcard = createMockDashboardCard({
      id: 1,
      dashboard_tab_id: 1,
      card_id: ORDERS_CARD.id,
      card: ORDERS_CARD,
      parameter_mappings: [
        createMockParameterMapping({
          parameter_id: DASHBOARD_LEVEL_PARAMETER.id,
          card_id: ORDERS_CARD.id,
          target: dimensionTarget(PRODUCTS.CATEGORY),
        }),
      ],
    });

    const { store } = setup({
      parameters: [DASHBOARD_LEVEL_PARAMETER],
      dashcards: [questionDashcard],
    });

    duplicateTab(1)(store.dispatch, store.getState);

    const newTabId = -2;
    const duplicatedQuestion = Object.values(
      getDashcards(store.getState()),
    ).find(
      (dc) => dc.dashboard_tab_id === newTabId && dc.card_id === ORDERS_CARD.id,
    );

    expect(duplicatedQuestion!.parameter_mappings).toEqual([
      expect.objectContaining({
        parameter_id: DASHBOARD_LEVEL_PARAMETER.id,
      }),
    ]);
    // dashboard level parameters should not be duplicated
    expect(getDashboard(store.getState())?.parameters).toEqual([
      DASHBOARD_LEVEL_PARAMETER,
    ]);
  });

  it("should not crash when dashcard data is not loaded yet (#78876)", () => {
    const questionDashcard = createMockDashboardCard({
      id: 1,
      dashboard_tab_id: 1,
      card_id: ORDERS_CARD.id,
      card: ORDERS_CARD,
    });

    const { store } = setup({
      parameters: [],
      dashcards: [questionDashcard],
      dashcardData: {},
    });

    expect(() => duplicateTab(1)(store.dispatch, store.getState)).not.toThrow();

    const newTabId = -2;
    const duplicatedQuestion = Object.values(
      getDashcards(store.getState()),
    ).find(
      (dc) => dc.dashboard_tab_id === newTabId && dc.card_id === ORDERS_CARD.id,
    );
    expect(duplicatedQuestion).toBeDefined();
    // No cache entry for the new dashcard; it fetches when the new tab is selected
    expect(
      store.getState().dashboard.dashcardData[duplicatedQuestion!.id],
    ).toBeUndefined();
  });

  it("should copy all cached series data for a dashcard (#78876)", () => {
    const SERIES_CARD_ID = 2;
    const questionDashcard = createMockDashboardCard({
      id: 1,
      dashboard_tab_id: 1,
      card_id: ORDERS_CARD.id,
      card: ORDERS_CARD,
    });
    const sourceDashcardData = {
      [ORDERS_CARD.id]: createMockDataset(),
      [SERIES_CARD_ID]: createMockDataset(),
    };

    const { store } = setup({
      parameters: [],
      dashcards: [questionDashcard],
      dashcardData: { [questionDashcard.id]: sourceDashcardData },
    });

    duplicateTab(1)(store.dispatch, store.getState);

    const newTabId = -2;
    const duplicatedQuestion = Object.values(
      getDashcards(store.getState()),
    ).find(
      (dc) => dc.dashboard_tab_id === newTabId && dc.card_id === ORDERS_CARD.id,
    );
    expect(
      store.getState().dashboard.dashcardData[duplicatedQuestion!.id],
    ).toEqual(sourceDashcardData);
  });
});

describe("deleteTab", () => {
  const TAB_1_CARD_PARAMETER = createMockParameter({
    id: "tab-1-card-filter",
    name: "Tab 1 Card Filter",
    type: "string/=",
    sectionId: "string",
  });
  const FILTERED_DASHBOARD_PARAMETER = {
    ...DASHBOARD_LEVEL_PARAMETER,
    filteringParameters: [CARD_PARAMETER.id],
  };
  const PARAMETERS = [
    FILTERED_DASHBOARD_PARAMETER,
    TAB_1_CARD_PARAMETER,
    CARD_PARAMETER,
  ];

  const TAB_3_CARD_PARAMETER = createMockParameter({
    id: "tab-3-card-filter",
    name: "Tab 3 Card Filter",
    type: "string/=",
    sectionId: "string",
  });

  function setupTabsWithCardFilters({ tabCount = 2 } = {}) {
    const hasTab3 = tabCount === 3;
    return setup({
      parameters: hasTab3 ? [...PARAMETERS, TAB_3_CARD_PARAMETER] : PARAMETERS,
      tabCount,
      dashcards: [
        createMockDashboardCard({
          id: 1,
          dashboard_tab_id: 1,
          card_id: ORDERS_CARD.id,
          card: ORDERS_CARD,
          inline_parameters: [TAB_1_CARD_PARAMETER.id],
        }),
        createMockDashboardCard({
          id: 2,
          dashboard_tab_id: 2,
          card_id: ORDERS_CARD.id,
          card: ORDERS_CARD,
          inline_parameters: [CARD_PARAMETER.id],
        }),
        ...(hasTab3
          ? [
              createMockDashboardCard({
                id: 3,
                dashboard_tab_id: 3,
                card_id: ORDERS_CARD.id,
                card: ORDERS_CARD,
                inline_parameters: [TAB_3_CARD_PARAMETER.id],
              }),
            ]
          : []),
      ],
    });
  }

  it("should remove card filters on the deleted tab and references to them (#78567)", () => {
    const { store } = setupTabsWithCardFilters();

    deleteTab(2)(store.dispatch, store.getState);

    expect(getTabs(store.getState()).map(({ id }) => id)).toEqual([1]);
    expect(getDashboard(store.getState())?.parameters).toEqual([
      { ...DASHBOARD_LEVEL_PARAMETER, filteringParameters: [] },
      TAB_1_CARD_PARAMETER,
    ]);
  });

  it("should restore the tab and its card filters on undo", async () => {
    const { store } = setupTabsWithCardFilters();

    deleteTab(2)(store.dispatch, store.getState);
    await waitFor(() => expect(store.getState().undo).toHaveLength(1));
    const [undo] = store.getState().undo;
    expect(undo.message).toBe('Deleted "Tab 2"');
    store.dispatch(performUndo(undo.id));

    expect(getTabs(store.getState()).map(({ id }) => id)).toEqual([1, 2]);
    expect(getDashboard(store.getState())?.parameters).toEqual(PARAMETERS);
    expect(getDashcards(store.getState())[2]).toMatchObject({
      isRemoved: false,
      inline_parameters: [CARD_PARAMETER.id],
    });
  });

  it("should keep filter changes made between deleting and undoing", async () => {
    const { store } = setupTabsWithCardFilters();
    const addedParameter = createMockParameter({ id: "added-filter" });
    const renamedParameter = { ...TAB_1_CARD_PARAMETER, name: "Renamed" };

    deleteTab(2)(store.dispatch, store.getState);
    store.dispatch(
      setDashboardAttributes({
        id: 1,
        attributes: {
          parameters: [
            renamedParameter,
            { ...DASHBOARD_LEVEL_PARAMETER, filteringParameters: [] },
            addedParameter,
          ],
        },
      }),
    );
    await waitFor(() => expect(store.getState().undo).toHaveLength(1));
    store.dispatch(performUndo(store.getState().undo[0].id));

    expect(getDashboard(store.getState())?.parameters).toEqual([
      renamedParameter,
      CARD_PARAMETER,
      FILTERED_DASHBOARD_PARAMETER,
      addedParameter,
    ]);
  });

  it("should only restore the filters of the tab being undone", async () => {
    const { store } = setupTabsWithCardFilters({ tabCount: 3 });

    deleteTab(2)(store.dispatch, store.getState);
    deleteTab(3)(store.dispatch, store.getState);
    await waitFor(() => expect(store.getState().undo).toHaveLength(2));
    const tab2Undo = store
      .getState()
      .undo.find(({ message }) => message === 'Deleted "Tab 2"');
    store.dispatch(performUndo(checkNotNull(tab2Undo).id));

    expect(getTabs(store.getState()).map(({ id }) => id)).toEqual([1, 2]);
    expect(getDashboard(store.getState())?.parameters).toEqual(PARAMETERS);
  });
});

type SetupOpts = {
  parameters: Parameter[];
  dashcards: StoreDashcard[];
  dashcardData?: DashCardDataMap;
  tabCount?: number;
};

function createDashboardState({
  parameters,
  dashcards,
  dashcardData = Object.fromEntries(
    dashcards
      .filter((dc) => dc.card_id != null)
      .map((dc) => [dc.id, { [dc.card_id!]: null }]),
  ),
  tabCount = 2,
}: SetupOpts) {
  return createMockDashboardState({
    dashboardId: 1,
    selectedTabId: 1,
    dashboards: {
      1: createMockStoreDashboard({
        id: 1,
        dashcards: dashcards.map((dc) => dc.id),
        parameters,
        tabs: _.range(1, tabCount + 1).map((id) =>
          createMockDashboardTab({ id, name: `Tab ${id}` }),
        ),
      }),
    },
    dashcards: _.indexBy(dashcards, "id"),
    dashcardData,
  });
}

function setup(opts: SetupOpts) {
  const store = getMainStore(
    createMockState({
      dashboard: createDashboardState(opts),
    }),
  );

  return { store };
}
