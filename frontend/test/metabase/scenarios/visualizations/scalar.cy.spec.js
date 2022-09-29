import {
  restore,
  visitQuestionAdhoc,
  visitDashboard,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > scalar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  const SCREEN_SIZES = {
    mobile: [600, 400],
    tablet: [900, 600],
    desktop: [1200, 800],
    hd: [1920, 1280],
  };

  Object.entries(SCREEN_SIZES).forEach(([size, viewport]) => {
    it(`should render human readable numbers on ${size} screen size (metabase`, () => {
      const [width, height] = viewport;

      cy.skipOn(size === "mobile");

      cy.viewport(width, height);
      cy.createQuestion({
        name: "12629",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["*", 1000000, ["sum", ["field", ORDERS.TOTAL, null]]]],
        },
        display: "scalar",
      }).then(({ body: { id: questionId } }) => {
        cy.createDashboard().then(({ body: { id: dashboardId } }) => {
          // Add previously created question to the dashboard
          cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
            cardId: questionId,
          }).then(({ body: { id: dashCardId } }) => {
            cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
              cards: [
                {
                  id: dashCardId,
                  card_id: questionId,
                  row: 0,
                  col: 0,
                  size_x: 4,
                  size_y: 4,
                  parameter_mappings: [],
                },
              ],
            });
          });
          visitDashboard(dashboardId);
          cy.findByText("1.5T");
        });
      });
    });
  });

  it(`should render date without time (metabase#7494)`, () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `SELECT cast('2018-05-01T00:00:00Z'::timestamp as date)`,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "scalar",
    });

    cy.findByText("April 30, 2018");
    cy.findByText("Settings").click();

    cy.findByText("Show the time").should("be.hidden");
    cy.findByText("Time style").should("be.hidden");
  });
});
