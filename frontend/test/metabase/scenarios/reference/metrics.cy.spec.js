import { signInAsAdmin, restore } from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > reference > metrics", () => {
  const METRIC_NAME = "orders < 100";
  const METRIC_DESCRIPTION = "Count of orders with a total under $100.";

  beforeEach(() => {
    restore();
    signInAsAdmin();

    cy.request("POST", "/api/metric", {
      definition: {
        aggregation: ["count"],
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        "source-table": ORDERS_ID,
      },
      name: METRIC_NAME,
      description: METRIC_DESCRIPTION,
      table_id: ORDERS_ID,
    });
  });

  it("should see the listing", () => {
    cy.visit("/reference/metrics");
    cy.contains(METRIC_NAME);
    cy.contains(METRIC_DESCRIPTION);
  });

  it("should let the user navigate to details", () => {
    cy.visit("/reference/metrics");
    cy.contains(METRIC_NAME).click();
    cy.contains("Why this metric is interesting");
  });

  it("should let an admin edit details about the metric", () => {
    cy.visit("/reference/metrics");
    cy.contains(METRIC_NAME).click();

    cy.contains("Edit").click();
    cy.contains("Description")
      .parent()
      .parent()
      .find("textarea")
      .type("Count of orders under $100");
    cy.contains("button", "Save").click();
    cy.contains("Reason for changes")
      .parent()
      .parent()
      .find("textarea")
      .type("Renaming the description");
    cy.contains("button", "Save changes").click();

    cy.contains("Count of orders under $100");
  });

  it("should let an admin start to edit and cancel without saving", () => {
    cy.visit("/reference/metrics");
    cy.contains(METRIC_NAME).click();

    cy.contains("Edit").click();
    cy.contains("Why this metric is interesting")
      .parent()
      .parent()
      .find("textarea")
      .type("Because it's very nice");
    cy.contains("Cancel").click();

    cy.contains("Because it's very nice").should("have.length", 0);
  });

  it("should have different URI while editing the metric", () => {
    cy.visit("/reference/metrics");
    cy.contains(METRIC_NAME).click();

    cy.url().should("match", /\/reference\/metrics\/\d+$/);
    cy.contains("Edit").click();
    cy.url().should("match", /\/reference\/metrics\/\d+\/edit$/);
  });
});
