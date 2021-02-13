// Migrated from frontend/test/metabase/user/UserSettings.integ.spec.js
import { restore, signInAsNormalUser, USERS } from "__support__/cypress";
const { first_name, last_name, username: email } = USERS.normal;

const CURRENT_USER = {
  email: "normal@metabase.com",
  ldap_auth: false,
  first_name: "Robert",
  locale: null,
  last_login: "2021-02-08T15:09:33.918",
  is_active: true,
  is_qbnewb: false,
  updated_at: "2021-02-08T15:09:33.918",
  group_ids: [1, 4, 5],
  is_superuser: false,
  login_attributes: null,
  id: 2,
  last_name: "Tableton",
  date_joined: "2021-02-08T15:04:16.251",
  personal_collection_id: 5,
  common_name: "Robert Tableton",
  google_auth: false,
};

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

  it("should have a change password tab", () => {
    cy.server();
    cy.route("GET", "/api/user/current").as("getUser");

    cy.visit("/user/edit_current");
    cy.wait("@getUser");
    cy.findByText("Password").should("exist");
  });

  describe("when user is authenticated via ldap", () => {
    beforeEach(() => {
      cy.server();
      cy.route(
        "GET",
        "/api/user/current",
        Object.assign({}, CURRENT_USER, {
          ldap_auth: true,
        }),
      ).as("getUser");

      cy.visit("/user/edit_current");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      cy.findByText("Password").should("not.exist");
    });
  });

  describe("when user is authenticated via google", () => {
    beforeEach(() => {
      cy.server();
      cy.route(
        "GET",
        "/api/user/current",
        Object.assign({}, CURRENT_USER, {
          google_auth: true,
        }),
      ).as("getUser");

      cy.visit("/user/edit_current");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      cy.findByText("Password").should("not.exist");
    });
  });
});
