import { restore, setupSMTP } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATASET;

describe("issue 18669", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setupSMTP();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: card }) => {
        cy.editDashboardCard(card, getFilterMapping(card));

        cy.intercept("POST", `/api/card/${card.id}/query`).as("cardQuery");
        cy.visit(`/dashboard/${card.dashboard_id}`);
        cy.wait("@cardQuery");
      },
    );
  });
});

const questionDetails = {
  name: "Product count",
  database: 1,
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

const filterDetails = {
  name: "Category",
  slug: "category",
  id: "c32a49e1",
  type: "category",
  default: ["Doohickey"],
};

const dashboardDetails = {
  parameters: [filterDetails],
};

const getFilterMapping = card => ({
  parameter_mappings: [
    {
      parameter_id: filterDetails.id,
      card_id: card.card_id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ],
});
