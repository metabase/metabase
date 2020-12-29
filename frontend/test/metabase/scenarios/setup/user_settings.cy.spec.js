// Migrated from frontend/test/metabase/user/UserSettings.integ.spec.js
import { restore, signInAsNormalUser, USERS } from "__support__/cypress";
const { first_name, last_name, username: email } = USERS.normal;

const requestsCount = alias =>
  cy.state("requests").filter(a => a.alias === alias);
describe("user > settings", () => {
  beforeEach(() => {
    restore();
    signInAsNormalUser();
  });

  it("should show user details", () => {
    cy.visit("/user/edit_current");
    cy.findByText("Account settings");
    cy.findByDisplayValue(first_name);
    cy.findByDisplayValue(last_name);
    cy.findByDisplayValue(email);
  });

  it("should update the user without fetching memberships", () => {
    cy.server();
    cy.route("GET", "/api/permissions/membership").as("membership");
    cy.visit("/user/edit_current");
    cy.findByDisplayValue(first_name)
      .click()
      .clear()
      .type("John");
    cy.findByText("Update").click();
    cy.findByDisplayValue("John");

    // It is hard and unreliable to assert that something didn't happen in Cypress
    // This solution was the only one that worked out of all others proposed in this SO topic: https://stackoverflow.com/a/59302542/8815185
    cy.get("@membership").then(() => {
      expect(requestsCount("membership")).to.have.length(0);
    });
  });
});
