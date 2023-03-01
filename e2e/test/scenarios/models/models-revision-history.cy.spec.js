import { restore, questionInfoButton } from "e2e/support/helpers";

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
    cy.wait("@dataset");

    cy.location("pathname").should("match", /^\/question\/3/);
    cy.get(".LineAreaBarChart");

    revertTo("^Turned this into a model");
    cy.wait("@dataset");

    cy.location("pathname").should("match", /^\/model\/3/);
    cy.get(".cellData");
  });
});

function visitModel(id) {
  cy.intercept("POST", "/api/dataset").as("dataset");
  cy.visit(`/model/${id}`);
  cy.wait("@dataset");
}

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
