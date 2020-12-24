// Migrated from frontend/test/metabase/user/UserSettings.integ.spec.js
import { restore, signInAsNormalUser, USERS } from "__support__/cypress";
const { first_name, last_name, username: email } = USERS.normal;

const requestsCount = alias =>
  cy.state("requests").filter(a => a.alias === alias).length;

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

    cy.get("@membership").then(() => {
      expect(requestsCount("ufg")).to.eq(0);
    });
  });
});
