import _ from "underscore";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  appBar,
  createQuestion,
  describeEE,
  navigationSidebar,
  restore,
  setTokenFeatures,
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

describe("scenarios > metrics > search", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should see metrics in recent items in global search", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
      visitMetric(card.id);
      cy.wait("@dataset");
    });
    navigationSidebar().findByText("Home").click();
    appBar().findByPlaceholderText("Search…").click();
    cy.findByTestId("search-results-floating-container")
      .findByText(ORDERS_SCALAR_METRIC.name)
      .click();
    cy.wait("@dataset");
    cy.findByTestId("scalar-container").should("be.visible");
  });

  it("should see metrics in recent items on the home page", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
      visitMetric(card.id);
      cy.wait("@dataset");
    });
    navigationSidebar().findByText("Home").click();
    cy.findByTestId("home-page").within(() => {
      cy.findByText("Pick up where you left off").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      cy.wait("@dataset");
    });
    cy.findByTestId("scalar-container").should("be.visible");
  });
});

describeEE("scenarios > metrics > search", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    setTokenFeatures("all");
  });

  it.skip("should see metrics in popular items on the homepage", () => {
    createQuestion({ ...ORDERS_SCALAR_METRIC, type: "question" }).then(
      ({ body: card }) => {
        visitMetric(card.id);
        cy.wait("@dataset");
      },
    );
    cy.signInAsNormalUser();
    cy.visit("/");
    cy.findByTestId("home-page").within(() => {
      cy.findByText("Here are some popular questions").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      cy.wait("@dataset");
    });
    cy.findByTestId("scalar-container").should("be.visible");
  });
});
