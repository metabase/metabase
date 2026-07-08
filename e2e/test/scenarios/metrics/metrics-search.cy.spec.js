const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/metric/dataset").as("metricDataset");
    cy.intercept("GET", "/api/search?q=*").as("search");
  });

  it("should be able to search for metrics in global search", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/");
    H.commandPaletteSearch(ORDERS_SCALAR_METRIC.name, false);
    H.commandPalette()
      .findByRole("option", { name: ORDERS_SCALAR_METRIC.name })
      .click();
    H.MetricPage.aboutPage().should("be.visible");
  });

  it("should be able to search for metrics on the search page", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/");
    H.commandPaletteSearch(ORDERS_SCALAR_METRIC.name, true);
    cy.wait("@search");
    cy.findByTestId("search-app").within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("type-search-filter").click();
    });
    H.popover().within(() => {
      cy.findByText("Metric").click();
      cy.findByText("Apply").click();
    });
    cy.wait("@search");
    cy.findByTestId("search-app").within(() => {
      cy.findByText("1 result").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).click();
    });
    H.MetricPage.aboutPage().should("be.visible");
  });

  it("should see metrics in recent items in global search", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
      H.visitMetric(card.id);
    });
    cy.visit("/");
    H.commandPaletteSearch(ORDERS_SCALAR_METRIC.name, false);
    H.commandPalette()
      .findByRole("option", { name: ORDERS_SCALAR_METRIC.name })
      .click();
    H.MetricPage.aboutPage().should("be.visible");
  });
});
