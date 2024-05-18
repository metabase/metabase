import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  commandPalette,
  commandPaletteSearch,
  createQuestion,
  navigationSidebar,
  popover,
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

describe("scenarios > metrics > search", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/search?q=*").as("search");
  });

  it("should be able to search for metrics in global search", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/");
    commandPaletteSearch(ORDERS_SCALAR_METRIC.name, false);
    commandPalette()
      .findByRole("option", { name: ORDERS_SCALAR_METRIC.name })
      .click();
    cy.wait("@dataset");
    cy.findByTestId("scalar-container").should("be.visible");
  });

  it("should be able to search for metrics on the search page", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/");
    commandPaletteSearch(ORDERS_SCALAR_METRIC.name, true);
    cy.wait("@search");
    cy.findByTestId("search-app").within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByTestId("type-search-filter").click();
    });
    popover().within(() => {
      cy.findByText("Metric").click();
      cy.findByText("Apply").click();
    });
    cy.wait("@search");
    cy.findByTestId("search-app").within(() => {
      cy.findByText("1 result").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
    });
    cy.wait("@dataset");
    cy.findByTestId("scalar-container").should("be.visible");
  });

  it("should see metrics in recent items in global search", () => {
    createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
      visitMetric(card.id);
      cy.wait("@dataset");
    });
    navigationSidebar().findByText("Home").click();
    commandPaletteSearch(ORDERS_SCALAR_METRIC.name, false);
    commandPalette()
      .findByRole("option", { name: ORDERS_SCALAR_METRIC.name })
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
