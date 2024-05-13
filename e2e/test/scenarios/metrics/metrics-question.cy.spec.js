import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  modal,
  restore,
  visitMetric,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

describe("scenarios > metrics > question", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to add a filter with an ad-hoc question", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );
    cy.findByTestId("qb-header-action-panel").button("Filter").click();
    modal().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Gadget").click();
      cy.button("Apply filters").click();
    });
    cy.findByTestId("scalar-container")
      .findByText("4,939")
      .should("be.visible");
  });
});
