import { USERS } from "e2e/support/cypress_data";
import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import { restore, visitQuestion, visitDashboard } from "e2e/support/helpers";

describe("scenarios > collection items metadata", () => {
  beforeEach(() => {
    restore();
  });

  describe("last edit date", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should display last edit moment for dashboards", () => {
      visitDashboard(ORDERS_DASHBOARD_ID);
      changeDashboard();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited a few seconds ago/i);
    });

    it("should display last edit moment for questions", () => {
      visitQuestion(ORDERS_QUESTION_ID);
      changeQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited a few seconds ago/i);
    });
  });

  describe("last editor", () => {
    it("should display if user is the last editor", () => {
      cy.signInAsAdmin();
      visitDashboard(ORDERS_DASHBOARD_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited .* by you/i);
      visitQuestion(ORDERS_QUESTION_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Edited .* by you/i);
      cy.signOut();
    });

    it("should display last editor's name", () => {
      const { first_name, last_name } = USERS.admin;
      // Example: John Doe —> John D.
      const expectedName = `${first_name} ${last_name.charAt(0)}.`;

      cy.signIn("normal");
      visitDashboard(ORDERS_DASHBOARD_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
      visitQuestion(ORDERS_QUESTION_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
    });

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

      cy.visit("/collection/root");

      cy.findByTestId("collection-table").within(() => {
        cy.findByText("Orders in a dashboard").click();
      });

      changeDashboard();

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

function getTableRowFor(name) {
  return cy.findByText(name).closest("tr");
}
