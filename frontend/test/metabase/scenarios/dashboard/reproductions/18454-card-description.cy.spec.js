import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const CARD_DESCRIPTION = "CARD_DESCRIPTION";

describe("issue 18454", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show card descriptions (metabase#18454)", () => {
    createDashboardWithQuestionWithDescription();

    cy.wait("@cardQuery");
    cy.icon("info").realHover();
    cy.findByText(CARD_DESCRIPTION);
  });
});

function createDashboardWithQuestionWithDescription() {
  const questionDetails = {
    name: "18454 Question",
    description: CARD_DESCRIPTION,
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "line",
  };

  cy.createQuestionAndDashboard({ questionDetails }).then(
    ({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            sizeX: 12,
            sizeY: 10,
          },
        ],
      });

      cy.visit(`/dashboard/${dashboard_id}`);

      cy.intercept("POST", `/api/card/${card_id}/query`).as("cardQuery");
    },
  );
}
