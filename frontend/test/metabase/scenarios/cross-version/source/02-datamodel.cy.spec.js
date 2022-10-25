import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

  cy.get(".AdminList").findByText("Orders").click();
  cy.findByDisplayValue("Product ID").parent().find(".Icon-gear").click();
  cy.findByText("Use original value").click();
  cy.findByText("Use foreign key").click();
  cy.findByText("Title").click();
  cy.wait("@updateProductId");

  cy.visit(sampleDBDataModelPage);
  cy.get(".AdminList").findByText("Reviews").click();
  cy.intercept("POST", `/api/field/${REVIEWS.RATING}/values`).as(
    "remapRatingValues",
  );

  cy.findByDisplayValue("Rating").parent().find(".Icon-gear").click();
  cy.findByText("Use original value").click();
  cy.findByText("Custom mapping").click();
  cy.wait("@remapRatingValues");
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
  cy.get(".AdminList").findByText("Products").click();

  cy.intercept("PUT", `/api/field/${PRODUCTS.EAN}`).as("hideEan");
  cy.findByDisplayValue("Ean").parent().contains("Everywhere").click();
  cy.findByText("Do not include").click();
  cy.wait("@hideEan");

  cy.intercept("PUT", `/api/field/${PRODUCTS.PRICE}`).as("updatePriceField");
  cy.findByDisplayValue("Price").parent().contains("No semantic type").click();
  cy.get(".MB-Select")
    .scrollTo("top")
    .within(() => {
      cy.findByPlaceholderText("Find...").type("Pr");
      cy.findByText("Price").click();
    });
  cy.wait("@updatePriceField");
  cy.findByText("US Dollar").click();
  cy.findByText("Euro").click();
  cy.wait("@updatePriceField");

  // Hide PEOPLE.PASSWORD
  cy.get(".AdminList").findByText("People").click();

  cy.intercept("PUT", `/api/field/${PEOPLE.PASSWORD}`).as("hidePassword");
  cy.findByDisplayValue("Password").parent().contains("Everywhere").click();
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

  cy.request("POST", "/api/metric", metric);
  cy.request("POST", "/api/segment", segment);

  cy.visit("/admin/datamodel/segments");
  cy.findByText(segment.name);

  cy.visit("/admin/datamodel/metrics");
  cy.findByText(metric.name);
});
