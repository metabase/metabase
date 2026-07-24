import _ from "underscore";

import { getMainStore } from "__support__/entities-store";
import type { StoreDashcard } from "metabase/redux/store";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import type {
  Parameter,
  QuestionDashboardCard,
  VirtualDashboardCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockParameterMapping,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { ORDERS, ORDERS_ID, PRODUCTS } from "metabase-types/api/mocks/presets";

import { TEST_DASHBOARD_STATE } from "../components/DashboardTabs/test-utils";
import { getDashboard, getDashcards } from "../selectors";

import {
  duplicateTab,
  getIdFromSlug,
  moveTab,
  resetTempTabId,
  tabsReducer,
} from "./tabs";

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

  it("should duplicate header filters with new ids and remapped card mappings", () => {
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
});

function createDashboardState({
  parameters,
  dashcards,
}: {
  parameters: Parameter[];
  dashcards: StoreDashcard[];
}) {
  return createMockDashboardState({
    dashboardId: 1,
    selectedTabId: 1,
    dashboards: {
      1: createMockStoreDashboard({
        id: 1,
        dashcards: dashcards.map((dc) => dc.id),
        parameters,
        tabs: [
          createMockDashboardTab({ id: 1, name: "Tab 1" }),
          createMockDashboardTab({ id: 2, name: "Tab 2" }),
        ],
      }),
    },
    dashcards: _.indexBy(dashcards, "id"),
    dashcardData: Object.fromEntries(
      dashcards
        .filter((dc) => dc.card_id != null)
        .map((dc) => [dc.id, { [dc.card_id!]: null }]),
    ),
  });
}

function setup({
  parameters,
  dashcards,
}: {
  parameters: Parameter[];
  dashcards: StoreDashcard[];
}) {
  const store = getMainStore(
    createMockState({
      dashboard: createDashboardState({ parameters, dashcards }),
    }),
  );

  return { store };
}
