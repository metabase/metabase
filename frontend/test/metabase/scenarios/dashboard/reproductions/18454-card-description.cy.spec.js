import { restore, visitDashboard } from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const CARD_DESCRIPTION = "CARD_DESCRIPTION";

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

describe("issue 18454", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        visitDashboard(dashboard_id);
      },
    );
  });

  it("should show card descriptions (metabase#18454)", () => {
    cy.get(".DashCard").realHover();
    cy.icon("info").trigger("mouseenter", { force: true });

    cy.findByText(CARD_DESCRIPTION);
  });
});
