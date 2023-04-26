import {
  restore,
  visitDashboard,
  filterWidget,
  updateDashboardCards,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS } = SAMPLE_DATABASE;

// After January 1st, 2020
const dashboardFilter = {
  default: "2020-01-01~",
  id: "d3b78b27",
  name: "Date Filter",
  slug: "date_filter",
  type: "date/all-options",
};

const questionDetails = {
  name: "12720_SQL",
  native: {
    query: "SELECT * FROM ORDERS WHERE {{filter}}",
    "template-tags": {
      filter: {
        id: "1d006bb7-045f-6c57-e41b-2661a7648276",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", ORDERS.CREATED_AT, null],
        "widget-type": "date/all-options",
        default: null,
      },
    },
  },
};

describe("issue 12720", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // In this test we're using already present question ("Orders") and the dashboard with that question ("Orders in a dashboard")
    cy.request("PUT", "/api/dashboard/1", {
      parameters: [dashboardFilter],
    });

    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: SQL_ID } }) => {
        updateDashboardCards({
          dashboard_id: 1,
          cards: [
            {
              card_id: SQL_ID,
              row: 0,
              col: 6, // making sure it doesn't overlap the existing card
              size_x: 5,
              size_y: 5,
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id: SQL_ID,
                  target: ["dimension", ["template-tag", "filter"]],
                },
              ],
            },
            // add filter to existing card
            {
              id: 1,
              card_id: 1,
              row: 0,
              col: 0,
              size_x: 5,
              size_y: 5,
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id: 1,
                  target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
                },
              ],
            },
          ],
        });
      },
    );
  });

  it("should show QB question on a dashboard with filter connected to card without data-permission (metabase#12720)", () => {
    cy.signIn("readonly");

    clickThrough("12720_SQL");
    clickThrough("Orders");
  });
});

function clickThrough(title) {
  visitDashboard(1);
  cy.get(".DashCard").contains(title).click();

  cy.location("search").should("contain", dashboardFilter.default);
  filterWidget().contains("After January 1, 2020");
}
