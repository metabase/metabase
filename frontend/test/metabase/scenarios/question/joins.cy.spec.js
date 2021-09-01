import { restore, openProductsTable, popover } from "__support__/e2e/cypress";
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
});
