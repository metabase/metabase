import {
  restore,
  openOrdersTable,
  openProductsTable,
  popover,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATASET;

describe("scenarios > question > joined questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it.skip("joining on a question with remapped values should work (metabase#15578)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    // Remap display value
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.createQuestion({
      name: "15578",
      query: { "source-table": ORDERS_ID },
    });
    openProductsTable({ mode: "notebook" });
    cy.findByText("Join data").click();
    popover()
      .findByText("Sample Dataset")
      .click();
    cy.findByText("Saved Questions").click();
    cy.findByText("15578").click();
    popover()
      .findByText("ID")
      .click();
    popover()
      .findByText("Product ID") // Implicit assertion - test will fail for multiple strings
      .click();
    cy.button("Visualize").click();
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });
  });

  it("should allow joins on multiple dimensions", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openOrdersTable({ mode: "notebook" });

    cy.findByText("Join data").click();
    popover()
      .findByText("Products")
      .click();

    cy.findByTestId("step-join-0-0").within(() => {
      cy.icon("add").click();
    });

    popover()
      .findByText("Created At")
      .click();
    popover()
      .findByText("Created At")
      .click();

    cy.icon("join_left_outer")
      .first()
      .click();
    popover()
      .findByText("Inner join")
      .click();

    cy.button("Visualize").click();
    cy.wait("@dataset");

    // 415 rows mean the join is done correctly,
    // (join on product's FK + join on the same "created_at" field)
    cy.findByText("Showing 415 rows");
  });
});
