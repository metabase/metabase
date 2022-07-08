import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
const { PRODUCTS } = SAMPLE_DATABASE;

describe("issue 23510", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("loads metadata when it is not cached (metabase#23510)", () => {
    cy.createNativeQuestion(
      {
        name: `Q23510`,
        native: {
          query:
            "select count(*) from orders left join products on products.id=orders.product_id where {{category}}",
          "template-tags": {
            ID: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
              name: "Category",
              display_name: "Category",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "category",
              default: null,
            },
          },
        },
        display: "scalar",
      },
      { visitQuestion: true },
    );

    cy.findByText("Open Editor").click();
    cy.icon("reference").click();

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("ORDERS");
      cy.findByText("PRODUCTS");
      cy.findByText("REVIEWS");
      cy.findByText("PEOPLE");

      cy.findByText("Back").click();

      cy.findByText("Sample Database");
    });
  });
});
