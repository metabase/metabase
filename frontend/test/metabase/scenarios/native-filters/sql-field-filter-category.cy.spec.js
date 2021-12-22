import { restore, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

describe("scenarios > filters > sql filters > field filter > Category", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();

    cy.createNativeQuestion({
      name: "Products SQL",
      native: {
        query: "select * from products where {{category}}",
        "template-tags": {
          category: {
            "display-name": "Field Filter",
            id: "abc123",
            name: "category",
            type: "dimension",
            "widget-type": "category",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            default: ["Doohickey"],
          },
        },
      },
      display: "table",
    }).then(({ body: { id: card_id } }) => {
      cy.visit(`/question/${card_id}`);
    });
  });

  it("should work despite it not showing up in the widget type list", () => {
    cy.findByText("Showing 42 rows");

    cy.icon("close").click();
    cy.findByText("Field Filter").click();

    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.findByText("Add filter").click();
    });

    cy.get(".RunButton")
      .first()
      .click();
    cy.findByText("Showing 51 rows");

    cy.findByText("Open Editor").click();
    cy.icon("variable").click();

    cy.findByText("Filter widget type")
      .parent()
      .find(".AdminSelect")
      .contains("String");
  });
});
