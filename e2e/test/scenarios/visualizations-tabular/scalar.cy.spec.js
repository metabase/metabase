import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  visitDashboard,
} from "e2e/support/helpers";

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
      cy.createQuestionAndDashboard({
        questionDetails: {
          name: "12629",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["*", 1000000, ["sum", ["field", ORDERS.TOTAL, null]]],
            ],
          },
          display: "scalar",
        },
        cardDetails: {
          size_x: 5,
          size_y: 4,
        },
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
        cy.findByText("1.5T");
      });
    });
  });

  it("should render date without time (metabase#7494)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT cast('2024-05-01T00:00:00Z'::timestamp as date)",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "scalar",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 30, 2024");
    cy.findByTestId("viz-settings-button").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Show the time").should("be.hidden");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Time style").should("be.hidden");
  });
});
