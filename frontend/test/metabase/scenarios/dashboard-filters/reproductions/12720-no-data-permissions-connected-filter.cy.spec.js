import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS } = SAMPLE_DATASET;

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
        "widget-type": "date/month-year",
        default: null,
      },
    },
  },
};

describe.skip("issue 12720", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/1/card/1/query").as("cardQuery");

    restore();
    cy.signInAsAdmin();
  });

  it("should show QB question on a dashboard with filter connected to card without data-permission (metabase#12720)", () => {
    // In this test we're using already present question ("Orders") and the dashboard with that question ("Orders in a dashboard")
    cy.addFilterToDashboard({ filter: dashboardFilter, dashboard_id: 1 });

    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: SQL_ID } }) => {
        cy.intercept("POST", `/api/card/${SQL_ID}/query`).as("sqlQuery");

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
                sizeX: 5,
                sizeY: 5,
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
                col: 6, // previous card's sizeX + 1 (making sure they don't overlap)
                sizeX: 5,
                sizeY: 5,
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

    cy.signIn("nodata");

    clickThrough("12720_SQL");
    clickThrough("Orders");
  });
});

function clickThrough(title) {
  cy.visit("/dashboard/1");
  cy.wait("@cardQuery");
  cy.wait("@sqlQuery");
  cy.get(".LegendItem")
    .contains(title)
    .click();
  cy.findByText(/^January 17, 2020/);
}
