import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

const question = {
  name: "19451",
  native: {
    query: "select count(*) from products where {{filter}}",
    "template-tags": {
      filter: {
        id: "1b33304a-18ea-cc77-083a-b5225954f200",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", PRODUCTS.ID, null],
        "widget-type": "id",
        default: null,
      },
    },
  },
  display: "scalar",
};

describe("issue 19451", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(question, { visitQuestion: true });
  });

  it("question field filter shows all tables from a selected database (metabase#19451)", () => {
    cy.findByText("Open Editor").click();
    cy.icon("variable").click();
    cy.findByText("Products").click();
    cy.icon("chevronleft").click();

    cy.findByText("Products");
    cy.findByText("Orders");
    cy.findByText("People");
    cy.findByText("Reviews");
  });
});
