import { H } from "e2e/support";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > models > revision history", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });
  });

  it("should allow reverting to a saved question state and back into a model again", () => {
    H.visitModel(ORDERS_BY_YEAR_QUESTION_ID);

    openRevisionHistory();
    revertTo("You created this");

    cy.location("pathname").should("match", /^\/question\/\d+/);
    H.echartsContainer();

    revertTo("You edited this");

    cy.location("pathname").should("match", /^\/model\/\d+/);
    cy.get("[data-testid=cell-data]");
  });
});

function openRevisionHistory() {
  cy.intercept("GET", "/api/user").as("user");
  H.questionInfoButton().click();
  cy.wait("@user");

  cy.findByText("History");
}

function revertTo(history) {
  const r = new RegExp(history);
  cy.findByText(r).closest("li").findByTestId("question-revert-button").click();
}
