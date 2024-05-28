import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

export const nativeQuestionDetails = {
  name: "Count of People by State (SQL)",
  native: {
    query:
      'SELECT "PUBLIC"."PEOPLE"."STATE" AS "STATE", count(*) AS "count" FROM "PUBLIC"."PEOPLE" WHERE 1=1 [[ AND {{city}}]] [[ AND {{state}}]] GROUP BY "PUBLIC"."PEOPLE"."STATE" ORDER BY "count" DESC, "PUBLIC"."PEOPLE"."STATE" ASC',
    "template-tags": {
      city: {
        id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
        name: "city",
        "display-name": "City",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/=",
      },
      state: {
        id: "6b8b10ef-0104-1047-1e1b-24s2d5954545",
        name: "state",
        "display-name": "State",
        type: "dimension",
        dimension: ["field", PEOPLE.STATE, null],
        "widget-type": "string/=",
      },
    },
  },
  display: "bar",
};

const stateFilter = {
  name: "State",
  slug: "state",
  id: "e8f79be9",
  type: "location/state",
};

const cityFilter = {
  name: "City",
  slug: "city",
  id: "170b8e99",
  type: "location/city",
  filteringParameters: [stateFilter.id],
};

export const nativeDashboardDetails = {
  name: "Embedding Dashboard With Linked Filters",
  parameters: [stateFilter, cityFilter],
};

export function mapNativeDashboardParameters({
  id,
  card_id,
  dashboard_id,
} = {}) {
  return cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        size_x: 24,
        size_y: 10,
        parameter_mappings: [
          {
            parameter_id: stateFilter.id,
            card_id,
            target: ["dimension", ["template-tag", stateFilter.slug]],
          },
          {
            parameter_id: cityFilter.id,
            card_id,
            target: ["dimension", ["template-tag", cityFilter.slug]],
          },
        ],
      },
    ],
  });
}

export const guiQuestion = {
  query: { "source-table": PRODUCTS_ID },
};

const idFilter = {
  name: "ID Filter",
  slug: "id_filter",
  id: "fde6db8b",
  type: "id",
  sectionId: "id",
  default: [1],
};

const categoryFilter = {
  name: "Category",
  slug: "category",
  id: "e8ff3175",
  type: "string/=",
  sectionId: "string",
  filteringParameters: ["fde6db8b"],
};

export const guiDashboard = {
  name: "Dashboard With GUI question",
  parameters: [idFilter, categoryFilter],
};

export function mapGUIDashboardParameters(id, card_id, dashboard_id) {
  const parameter_mappings = [
    {
      parameter_id: idFilter.id,
      card_id,
      target: ["dimension", ["field", PRODUCTS.ID, null]],
    },
    {
      parameter_id: categoryFilter.id,
      card_id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ];

  cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        size_x: 13,
        size_y: 8,
        series: [],
        visualization_settings: {},
        parameter_mappings,
      },
    ],
  });
}
