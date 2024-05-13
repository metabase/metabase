import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  appBar,
  createQuestion,
  navigationSidebar,
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

  it("should see metrics in recent items", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
      visitMetric(card.id),
    );

    cy.log("Global search");
    appBar().findByPlaceholderText("Search…").click();
    cy.findByTestId("search-results-floating-container")
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");

    cy.log("Home page");
    navigationSidebar().findByText("Home").click();
    cy.findByTestId("home-page").within(() => {
      cy.findByText("Pick up where you left off").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
    });
  });
});
