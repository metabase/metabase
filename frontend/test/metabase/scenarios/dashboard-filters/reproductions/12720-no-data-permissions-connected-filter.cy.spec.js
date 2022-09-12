import { restore, visitDashboard, filterWidget } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
    cy.addFilterToDashboard({ filter: dashboardFilter, dashboard_id: 1 });

    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: SQL_ID } }) => {
        cy.request("POST", "/api/dashboard/1/cards", {
          cardId: SQL_ID,
        }).then(({ body: { id: SQL_DASH_CARD_ID } }) => {
          cy.log(
            "Edit both cards (adjust their size and connect them to the filter)",
          );

          cy.request("PUT", "/api/dashboard/1/cards", {
            cards: [
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
                visualization_settings: {},
              },
              {
                id: SQL_DASH_CARD_ID,
                card_id: SQL_ID,
                row: 0,
                col: 6, // previous card's size_x + 1 (making sure they don't overlap)
                size_x: 5,
                size_y: 5,
                parameter_mappings: [
                  {
                    parameter_id: dashboardFilter.id,
                    card_id: SQL_ID,
                    target: ["dimension", ["template-tag", "filter"]],
                  },
                ],
                visualization_settings: {},
              },
            ],
          });
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
