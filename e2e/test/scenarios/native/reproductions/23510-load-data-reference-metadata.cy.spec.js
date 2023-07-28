import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
const { PRODUCTS } = SAMPLE_DATABASE;

describe("issue 23510", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("loads metadata when it is not cached (metabase#23510)", () => {
    cy.createNativeQuestion(
      {
        database: 1,
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Open Editor").click();
    cy.icon("reference").click();

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("ORDERS");
      cy.findByText("PRODUCTS");
      cy.findByText("REVIEWS");
      cy.findByText("PEOPLE");
      cy.findByText("Sample Database");
    });
  });
});
