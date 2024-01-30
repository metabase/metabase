// import {
//   restore,
//   openNavigationSidebar,
//   visitDashboard,
//   createDashboardWithTabs,
// } from "e2e/support/helpers";
import { restore, visitDashboard } from "e2e/support/helpers";
// import {
//   ORDERS_DASHBOARD_ID,
//   ORDERS_DASHBOARD_DASHCARD_ID,
//   ORDERS_QUESTION_ID,
//   ORDERS_COUNT_QUESTION_ID,
//   ORDERS_BY_YEAR_QUESTION_ID,
//   ADMIN_PERSONAL_COLLECTION_ID,
//   NORMAL_PERSONAL_COLLECTION_ID,
// } from "e2e/support/cypress_sample_instance_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createMockDashboardCard } from "metabase-types/api/mocks";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
// import { createMockDashboardCard } from "metabase-types/api/mocks";
const { ORDERS, PEOPLE } = SAMPLE_DATABASE;

// const ratingFilter = {
//   name: "Text",
//   slug: "text",
//   id: "5dfco74e",
//   type: "string/=",
//   sectionId: "string",
// };

// const paramDashboard = {
//   name: "Dashboard With Params",
//   parameters: [ratingFilter],
// };

// const regularDashboard = {
//   name: "Dashboard Without Params",
// };

const TAB_1 = {
  id: 1,
  name: "Tab 1",
};

const TAB_2 = {
  id: 2,
  name: "Tab 2",
};

const DASHBOARD_TEXT_FILTER = {
  id: "3",
  name: "Text filter",
  slug: "filter-text",
  type: "string/contains",
};

describe("issue 38245", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    restore();
    cy.signInAsAdmin();
  });

  it("should do something", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [DASHBOARD_TEXT_FILTER],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_1.id,
          parameter_mappings: [
            createTextFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
          ],
          size_x: 5,
          size_y: 5,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));
  });
});

const createTextFilterMapping = ({ card_id }) => {
  const fieldRef = [
    "field",
    PEOPLE.NAME,
    {
      "base-type": "type/Text",
      "source-field": ORDERS.USER_ID,
    },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_TEXT_FILTER.id,
    target: ["dimension", fieldRef],
  };
};

function createDashboardWithTabs({ dashcards, tabs, ...dashboardDetails }) {
  return cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
      ...dashboard,
      dashcards,
      tabs,
    }).then(({ body: dashboard }) => cy.wrap(dashboard));
  });
}
