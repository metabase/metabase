import { restore } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

describe("scenarios > collection items metadata", () => {
  beforeEach(() => {
    restore();
  });

  describe("last edit date", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should display last edit moment for dashboards", () => {
      cy.visit("/dashboard/1");
      changeDashboard();
      cy.findByText(/Edited a few seconds ago/i);
    });

    it("should display last edit moment for questions", () => {
      cy.visit("/question/1");
      changeQuestion();
      cy.findByText(/Edited a few seconds ago/i);
    });
  });

  describe("last editor", () => {
    it("should display if user is the last editor", () => {
      cy.signInAsAdmin();
      cy.visit("/dashboard/1");
      cy.findByText(/Edited .* by you/i);
      cy.visit("/question/1");
      cy.findByText(/Edited .* by you/i);
    });

    it("should display last editor's name", () => {
      const { first_name, last_name } = USERS.admin;
      // Example: John Doe —> John D.
      const expectedName = `${first_name} ${last_name.charAt(0)}.`;

      cy.signIn("normal");
      cy.visit("/dashboard/1");
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
      cy.visit("/question/1");
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
    });

    it("should change last editor when another user changes item", () => {
      const { first_name, last_name } = USERS.normal;
      const fullName = `${first_name} ${last_name}`;

      cy.signIn("normal");
      cy.visit("/collection/root");
      // Ensure nothing is edited by current user,
      // Otherwise, the test is irrelevant
      cy.findByText(fullName).should("not.exist");

      cy.findByText("Orders").click();
      changeQuestion();

      cy.visit("/collection/root");
      cy.findByText("Orders in a dashboard").click();
      changeDashboard();

      cy.visit("/collection/root");
      getTableRowFor("Orders").findByText(fullName);
      getTableRowFor("Orders in a dashboard").findByText(fullName);
    });
  });
});

function changeDashboard() {
  cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
  cy.icon("ellipsis").click();
  cy.findByText("Edit dashboard details").click();
  cy.findByLabelText("Description")
    .click()
    .type("This dashboard is just beautiful");
  cy.button("Update").click();
  cy.wait("@updateDashboard");
}

function changeQuestion() {
  cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  cy.findByTestId("saved-question-header-button").click();
  cy.findByTestId("edit-details-button").click();
  cy.findByLabelText("Description").click().type("Very insightful");
  cy.button("Save").click();
  cy.wait("@updateQuestion");
}

function getTableRowFor(name) {
  return cy.findByText(name).closest("tr");
}
