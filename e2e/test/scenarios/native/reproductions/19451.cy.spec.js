import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Open Editor").click();
    cy.icon("variable").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products").click();
    cy.icon("chevronleft").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviews");
  });
});
