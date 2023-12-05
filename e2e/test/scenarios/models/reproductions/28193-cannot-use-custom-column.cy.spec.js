import { restore, enterCustomColumnDetails } from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const ccName = "CTax";

describe("issue 28193", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    // Turn the question into a model
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { dataset: true });
  });

  it("should be able to use custom column in a model query (metabase#28193)", () => {
    // Go directly to model's query definition
    cy.visit(`/model/${ORDERS_QUESTION_ID}/query`);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({
      formula: "[Tax]",
      name: ccName,
    });
    cy.button("Done").click();

    cy.get(".RunButton").click();
    cy.wait("@dataset");

    cy.button("Save changes").click();
    cy.location("pathname").should("not.include", "/query");

    assertOnColumns();

    cy.reload();
    cy.wait("@dataset");

    assertOnColumns();
  });
});

function assertOnColumns() {
  cy.findAllByText("2.07").should("be.visible").and("have.length", 2);
  cy.findAllByTestId("header-cell")
    .should("be.visible")
    .last()
    .should("have.text", ccName);
}
