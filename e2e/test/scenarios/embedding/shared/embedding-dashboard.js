import { produce } from "immer";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

export const questionDetails = {
  native: {
    query:
      "SELECT COUNT(*) FROM people WHERE {{id}} AND {{name}} AND {{source}} /* AND {{user_id}} */",
    "template-tags": {
      id: {
        id: "3fce42dd-fac7-c87d-e738-d8b3fc9d6d56",
        name: "id",
        display_name: "Id",
        type: "dimension",
        dimension: ["field", PEOPLE.ID, null],
        "widget-type": "id",
        default: null,
      },
      name: {
        id: "1fe12d96-8cf7-49e4-05a3-6ed1aea24490",
        name: "name",
        display_name: "Name",
        type: "dimension",
        dimension: ["field", PEOPLE.NAME, null],
        "widget-type": "category",
        default: null,
      },
      source: {
        id: "aed3c67a-820a-966b-d07b-ddf54a7f2e5e",
        name: "source",
        display_name: "Source",
        type: "dimension",
        dimension: ["field", PEOPLE.SOURCE, null],
        "widget-type": "category",
        default: null,
      },
      user_id: {
        id: "cd4bb37d-8404-488e-f66a-6545a261bbe0",
        name: "user_id",
        display_name: "User",
        type: "dimension",
        dimension: ["field", ORDERS.USER_ID, null],
        "widget-type": "id",
        default: null,
      },
    },
  },
  display: "scalar",
};

export const questionDetailsWithDefaults = produce(questionDetails, draft => {
  const tags = draft.native["template-tags"];
  tags.id.default = [1, 2];
  tags.name.default = ["Lina Heaney"];
  tags.source.default = ["Facebook"];
});

// Define dashboard filters
const idFilter = { name: "Id", slug: "id", id: "1", type: "id" };

const nameFilter = { name: "Name", slug: "name", id: "2", type: "category" };

const sourceFilter = {
  name: "Source",
  slug: "source",
  id: "3",
  type: "category",
};

const userFilter = { name: "User", slug: "user_id", id: "4", type: "id" };

const unusedFilter = {
  name: "Not Used Filter",
  slug: "not_used",
  id: "5",
  type: "category",
};

const parameters = [
  idFilter,
  nameFilter,
  sourceFilter,
  userFilter,
  unusedFilter,
];

const defaultTabId = 1;

const tabs = [
  { id: defaultTabId, name: "Tab 1" },
  { id: 2, name: "Tab 2" },
];

export const dashboardDetails = {
  tabs,
  parameters,
};

function getParameterMappings(parameters, card_id) {
  const parameter_mappings = [];

  parameters.map(({ id, slug }) => {
    parameter_mappings.push({
      parameter_id: id,
      card_id,
      target: ["dimension", ["template-tag", slug]],
    });
  });

  return parameter_mappings;
}

export function mapParameters({
  id,
  card_id,
  dashboard_id,
  dashboard_tab_id = defaultTabId,
} = {}) {
  return cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
    tabs,
    dashcards: [
      {
        id,
        dashboard_tab_id,
        card_id,
        row: 0,
        col: 0,
        size_x: 24,
        size_y: 6,
        series: [],
        visualization_settings: {},
        parameter_mappings: getParameterMappings(parameters, card_id),
      },
    ],
  });
}
