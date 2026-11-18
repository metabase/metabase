const { H } = cy;
import { USERS } from "e2e/support/cypress_data";

describe("scenarios > collection items metadata", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("last editor", () => {
    it("should change last editor when another user changes item", () => {
      const { first_name, last_name } = USERS.normal;
      const fullName = `${first_name} ${last_name}`;

      cy.signIn("normal");
      cy.visit("/collection/root");

      // Ensure nothing is edited by current user,
      // Otherwise, the test is irrelevant
      cy.findByTestId("collection-table").within(() => {
        cy.findByText(fullName).should("not.exist");
        cy.findByText("Orders").click();
      });

      changeQuestion();
      cy.findByTestId("qb-header")
        .findByTestId("revision-history-button")
        .should("have.text", "Edited a few seconds ago by you");

      cy.visit("/collection/root");

      cy.findByTestId("collection-table").within(() => {
        cy.findByText("Orders in a dashboard").click();
      });

      changeDashboard();
      cy.findByTestId("dashboard-header")
        .findByTestId("revision-history-button")
        .should("have.text", "Edited a few seconds ago by you");

      cy.visit("/collection/root");
      getTableRowFor("Orders!").findByText(fullName);
      getTableRowFor("Dash").findByText(fullName);
    });
  });
});

function changeDashboard() {
  cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
  cy.findByDisplayValue("Orders in a dashboard").clear().type("Dash").blur();
  cy.wait("@updateDashboard");
}

function changeQuestion() {
  cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  cy.findByDisplayValue("Orders").type("!").blur();
  cy.wait("@updateQuestion");
}

function getTableRowFor(name: string) {
  return cy.findByText(name).closest("tr");
}
