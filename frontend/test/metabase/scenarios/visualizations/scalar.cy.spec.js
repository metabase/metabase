import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

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
    it(`should render human readable numbers on ${size} screen size (metabase#12629)`, () => {
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
        cy.createDashboard("12629").then(({ body: { id: dashboardId } }) => {
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
                  sizeX: 4,
                  sizeY: 4,
                  parameter_mappings: [],
                },
              ],
            });
          });
          cy.visit(`/dashboard/${dashboardId}`);
          cy.findByText("1.5T");
        });
      });
    });
  });
});
