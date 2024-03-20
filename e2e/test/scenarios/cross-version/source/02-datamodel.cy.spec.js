import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createMetric,
  createSegment,
} from "e2e/support/helpers/e2e-table-metadata-helpers";

const { ORDERS, ORDERS_ID, REVIEWS, PRODUCTS, PEOPLE } = SAMPLE_DATABASE;

const sampleDBDataModelPage = `/admin/datamodel/database/${SAMPLE_DB_ID}`;

it("should configure data model settings", () => {
  cy.signInAsAdmin();

  cy.visit("/admin/datamodel");
  cy.location("pathname").should("eq", sampleDBDataModelPage);

  // Remap ORDERS.PRODUCT_ID display value to PRODUCTS.TITLE
  cy.intercept("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`).as(
    "updateProductId",
  );

  cy.findByTestId("admin-metadata-table-list").findByText("Orders").click();

  cy.findByDisplayValue("Product ID")
    .parent()
    .parent()
    .find(".Icon-gear")
    .click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Use original value").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Use foreign key").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Title").click();
  cy.wait("@updateProductId");

  cy.visit(sampleDBDataModelPage);
  cy.findByTestId("admin-metadata-table-list").findByText("Reviews").click();
  cy.intercept("POST", `/api/field/${REVIEWS.RATING}/values`).as(
    "remapRatingValues",
  );

  cy.findByDisplayValue("Rating").parent().parent().find(".Icon-gear").click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Use original value").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Custom mapping").click();
  cy.wait("@remapRatingValues");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText(
    "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
  );

  const customMap = {
    1: "Awful",
    2: "Unpleasant",
    3: "Meh",
    4: "Enjoyable",
    5: "Perfecto",
  };

  Object.entries(customMap).forEach(([key, value]) => {
    cy.findByDisplayValue(key).click().clear().type(value, { delay: 0 });
  });

  cy.button("Save").click();
  cy.wait("@remapRatingValues");

  // Hide PRODUCTS.EAN
  cy.visit(sampleDBDataModelPage);
  cy.findByTestId("admin-metadata-table-list").findByText("Products").click();

  cy.intercept("PUT", `/api/field/${PRODUCTS.EAN}`).as("hideEan");

  cy.findByDisplayValue("Ean").parent().parent().contains("Everywhere").click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Do not include").click();
  cy.wait("@hideEan");

  cy.intercept("PUT", `/api/field/${PRODUCTS.PRICE}`).as("updatePriceField");

  cy.findByDisplayValue("Price")
    .parent()
    .parent()
    .contains("No semantic type")
    .click();

  cy.get(".MB-Select")
    .scrollTo("top")
    .within(() => {
      cy.findByPlaceholderText("Find...").type("Pr");
      cy.findByText("Price").click();
    });
  cy.wait("@updatePriceField");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("US Dollar").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Euro").click();
  cy.wait("@updatePriceField");

  // Hide PEOPLE.PASSWORD
  cy.findByTestId("admin-metadata-table-list").findByText("People").click();

  cy.intercept("PUT", `/api/field/${PEOPLE.PASSWORD}`).as("hidePassword");

  cy.findByDisplayValue("Password")
    .parent()
    .parent()
    .contains("Everywhere")
    .click();

  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Do not include").click();
  cy.wait("@hidePassword");

  const metric = {
    name: "Revenue",
    description: "Sum of orders subtotal",
    table_id: ORDERS_ID,
    definition: {
      "source-table": ORDERS_ID,
      aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
    },
  };

  const segment = {
    name: "Large Purchases",
    description: "Orders over $100.",
    table_id: ORDERS_ID,
    definition: {
      "source-table": ORDERS_ID,
      filter: [">", ["field", ORDERS.TOTAL, null], 100],
    },
  };

  createMetric(metric);
  createSegment(segment);

  cy.visit("/admin/datamodel/segments");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText(segment.name);

  cy.visit("/admin/datamodel/metrics");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText(metric.name);
});
