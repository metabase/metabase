import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { modal, restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > reference > metrics", () => {
  const METRIC_NAME = "orders < 100";
  const METRIC_DESCRIPTION = "Count of orders with a total under $100.";

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("POST", "/api/legacy-metric", {
      definition: {
        aggregation: ["count"],
        filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        "source-table": ORDERS_ID,
      },
      name: METRIC_NAME,
      description: METRIC_DESCRIPTION,
      table_id: ORDERS_ID,
    }).then(({ body: { id } }) => {
      cy.wrap(id).as("metricId");
    });
  });

  it("should let an admin edit details about the metric", () => {
    cy.get("@metricId").then(id => {
      cy.log("Should see the listing");
      cy.visit("/reference/metrics");
      cy.location("pathname").should("eq", "/reference/metrics");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(METRIC_DESCRIPTION);

      cy.log("Should let the user navigate to details");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(METRIC_NAME).click();
      cy.location("pathname").should("eq", `/reference/metrics/${id}`);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit").click();
      cy.location("pathname").should("eq", `/reference/metrics/${id}/edit`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Description")
        .parent()
        .parent()
        .find("textarea")
        .clear()
        .type("Count of orders under $100");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      modal().find("textarea").type("Renaming the description");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save changes").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of orders under $100");

      cy.log(
        "Make sure this is reflected in the revision history (metabase#42633)",
      );
      cy.findAllByRole("listitem")
        .filter(':contains("Revision history for orders < 100")')
        .click();

      cy.location("pathname").should(
        "eq",
        `/reference/metrics/${id}/revisions`,
      );
      cy.findAllByRole("listitem").should(
        "contain",
        "Renaming the description",
      );
    });
  });

  it("should let an admin start to edit and cancel without saving", () => {
    cy.get("@metricId").then(id => {
      cy.visit(`/reference/metrics/${id}/edit`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Why this metric is interesting")
        .parent()
        .parent()
        .find("textarea")
        .type("Because it's very nice");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Cancel").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Because it's very nice").should("not.exist");
      cy.location("pathname").should("eq", `/reference/metrics/${id}`);
    });
  });
});
