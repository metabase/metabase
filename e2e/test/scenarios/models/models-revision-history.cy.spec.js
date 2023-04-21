import { restore, questionInfoButton, visitModel } from "e2e/support/helpers";

describe("scenarios > models > revision history", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  beforeEach(() => {
    cy.request("PUT", "/api/card/3", {
      name: "Orders Model",
      dataset: true,
    });
  });

  it("should allow reverting to a saved question state and back into a model again", () => {
    visitModel(3);

    openRevisionHistory();
    revertTo("You created this");
    cy.wait("@modelQuery3");

    cy.location("pathname").should("match", /^\/question\/3/);
    cy.get(".LineAreaBarChart");

    revertTo("^Turned this into a model");
    cy.wait("@modelQuery3");

    cy.location("pathname").should("match", /^\/model\/3/);
    cy.get(".cellData");
  });
});

function openRevisionHistory() {
  cy.intercept("GET", "/api/user").as("user");
  questionInfoButton().click();
  cy.wait("@user");

  cy.findByText("History");
}

function revertTo(history) {
  const r = new RegExp(history);
  cy.findByText(r).closest("li").findByTestId("question-revert-button").click();
}
