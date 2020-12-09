import {
  signInAsAdmin,
  restore,
  openOrdersTable,
  openProductsTable,
  popover,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

describe("scenarios > question > filter", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it.skip("should load needed data (metabase#12985)", () => {
    // Save a Question
    openProductsTable();
    cy.findByText("Save").click();
    cy.findByPlaceholderText("What is the name of your card?")
      .clear()
      .type("Q1");
    cy.findAllByText("Save")
      .last()
      .click();
    cy.findByText("Not now").click();

    // From Q1, save Q2
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("Q1").click();
    cy.findByText("Save").click();
    cy.findByPlaceholderText("What is the name of your card?")
      .clear()
      .type("Q2");
    cy.findAllByText("Save")
      .last()
      .click();

    // Add Q2 to a dashboard
    cy.findByText("Yes please!").click();
    cy.findByText("Orders in a dashboard").click();

    // Add two dashboard filters
    cy.get(".Icon-filter").click();
    cy.findByText("Time").click();
    cy.findByText("All Options").click();
    cy.findAllByText("Select…")
      .last()
      .click();
    cy.findByText("Created At").click();

    cy.get(".Icon-filter").click();
    cy.findByText("Other Categories").click();
    cy.findAllByText("Select…")
      .last()
      .click();
    popover().within(() => {
      cy.findByText("Category").click();
    });

    // Save dashboard and refresh page
    cy.findAllByText("Done")
      .first()
      .click();

    cy.findByText("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");

    // Check category search
    cy.get("fieldset")
      .last()
      .within(() => {
        cy.findByText("Category").click();
      });
    cy.log("**Failing to show dropdown in v0.36.0 through v.0.37.0**");
    cy.findByText("Gadget").click();
    cy.findByText("Add filter").click();
  });

  it("should filter a joined table by 'Is not' filter (metabase#13534)", () => {
    // NOTE: the original issue mentions "Is not" and "Does not contain" filters
    // we're testing for one filter only to keep things simple

    openOrdersTable({ mode: "notebook" });
    // join with Products
    cy.findByText("Join data").click();
    cy.findByText("Products").click();
    // add filter
    cy.findByText("Filter").click();
    popover().within(() => {
      // we've run into weird "name normalization" issue
      // where it displays "Product" locally, and "Products" in CI
      // also, we need to eliminate "Product ID" - that's why I used `$`
      cy.contains(/products?$/i).click();
    });
    cy.findByText("Category").click();
    cy.findByText("Is").click();
    cy.findByText("Is not").click();
    cy.findByText("Gizmo").click();
    cy.findByText("Add filter").click();
    cy.contains("Category is not Gizmo");

    cy.findByText("Visualize").click();
    // wait for results to load
    cy.get(".LoadingSpinner").should("not.exist");
    cy.log("**The point of failure in 0.37.0-rc3**");
    cy.contains("37.65");
    cy.findByText("There was a problem with your question").should("not.exist");
    // this is not the point of this repro, but additionally make sure the filter is working as intended on "Gizmo"
    cy.findByText("3621077291879").should("not.exist"); // one of the "Gizmo" EANs
  });

  it("'Between Dates' filter should behave consistently (metabase#12872)", () => {
    cy.request("POST", "/api/card", {
      name: "12872",
      dataset_query: {
        database: 1,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          filter: [
            "and",
            [
              "between",
              ["field-id", PRODUCTS.CREATED_AT],
              "2019-04-15",
              "2019-04-15",
            ],
            [
              "between",
              ["joined-field", "Products", ["field-id", PRODUCTS.CREATED_AT]],
              "2019-04-15",
              "2019-04-15",
            ],
          ],
          joins: [
            {
              alias: "Products",
              condition: [
                "=",
                ["field-id", PRODUCTS.ID],
                ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
        },
        type: "query",
      },
      display: "scalar",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      cy.visit(`/question/${questionId}`);
      cy.findByText("12872");
      cy.log("**At the moment of unfixed issue, it's showing '0'**");
      cy.get(".ScalarValue").contains("1");
    });
  });

  it.skip("should filter based on remapped values (metabase#13235)", () => {
    // set "Filtering on this field" = "A list of all values"
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    // "Display values" = "Use foreign key" as `Product.Title`
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    // Add filter as remapped Product ID (Product name)
    openOrdersTable();
    cy.findByText("Filter").click();
    cy.get(".List-item-title")
      .contains("Product ID")
      .click();
    cy.get(".scroll-y")
      .contains("Aerodynamic Linen Coat")
      .click();
    cy.findByText("Add filter").click();

    cy.log("**Reported failing on v0.36.4 and v0.36.5.1**");
    cy.get(".LoadingSpinner").should("not.exist");
    cy.findAllByText("148.23"); // one of the subtotals for this product
    cy.findAllByText("Fantastic Wool Shirt").should("not.exist");
  });

  it.skip("should filter using Custom Expression from aggregated results (metabase#12839)", () => {
    const CE_NAME = "Simple Math";

    cy.request("POST", "/api/card", {
      name: "12839",
      dataset_query: {
        database: 1,
        query: {
          filter: [">", ["field-literal", CE_NAME, "type/Float"], 0],
          "source-query": {
            aggregation: [
              ["aggregation-options", ["+", 1, 1], { "display-name": CE_NAME }],
            ],
            breakout: [["field-id", PRODUCTS.CATEGORY]],
            "source-table": PRODUCTS_ID,
          },
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      cy.server();
      cy.route("POST", `/api/card/${questionId}/query`).as("cardQuery");

      cy.visit(`/question/${questionId}`);
      cy.wait("@cardQuery");

      cy.log("**Reported failing on v0.35.4**");
      cy.log(`Error message: **Column 'source.${CE_NAME}' not found;**`);
      cy.findAllByText("Gizmo");
    });
  });
});
