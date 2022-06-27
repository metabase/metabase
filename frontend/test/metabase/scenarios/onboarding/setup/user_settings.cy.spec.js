// Migrated from frontend/test/metabase/user/UserSettings.integ.spec.js
import { restore } from "__support__/e2e/helpers";
import { USERS } from "__support__/e2e/cypress_data";
const { first_name, last_name, email, password } = USERS.normal;

const CURRENT_USER = {
  email: "normal@metabase.test",
  ldap_auth: false,
  first_name: "Robert",
  locale: null,
  last_login: "2021-02-08T15:09:33.918",
  is_active: true,
  is_qbnewb: false,
  updated_at: "2021-02-08T15:09:33.918",
  user_group_memberships: [
    { id: 1, is_group_manager: false },
    { id: 4, is_group_manager: false },
    { id: 5, is_group_manager: false },
  ],
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
    cy.signInAsNormalUser();
  });

  it("should show user details with disabled submit button", () => {
    cy.visit("/account/profile");
    cy.findByText("Account settings");
    cy.findByDisplayValue(first_name);
    cy.findByDisplayValue(last_name);
    cy.findByDisplayValue(email);
    cy.button("Update").should("be.disabled");
  });

  it("should update the user without fetching memberships", () => {
    cy.server();
    cy.route("GET", "/api/permissions/membership").as("membership");
    cy.visit("/account/profile");
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

    cy.visit("/account/profile");
    cy.wait("@getUser");
    cy.findByText("Password").should("exist");
  });

  it("should redirect to the login page when the user has signed out but tries to visit `/account/profile` (metabase#15471)", () => {
    cy.signOut();
    cy.visit("/account/profile");
    cy.url().should("include", "/auth/login");
    cy.findByText("Sign in to Metabase");
  });

  it("should redirect to the login page when the user has changed the password and logged out (metabase#18151)", () => {
    cy.visit("/account/password");

    cy.findByLabelText("Current password").type(password);
    cy.findByLabelText("Create a password").type(password);
    cy.findByLabelText("Confirm your password").type(password);
    cy.findByText("Save").click();
    cy.findByText("Success");

    cy.findByLabelText("gear icon").click();
    cy.findByText("Sign out").click();
    cy.findByText("Sign in to Metabase");
  });

  it("should validate form values (metabase#23259)", () => {
    cy.signInAsNormalUser();
    cy.visit("/account/password");

    // Validate common passwords
    cy.findByLabelText("Create a password")
      .as("passwordInput")
      .type("qwerty123")
      .blur();

    cy.contains("password is too common");
    cy.get("@passwordInput").clear();

    // Validate invalid current password
    cy.findByLabelText("Current password")
      .as("currentPassword")
      .type("invalid");

    cy.get("@passwordInput").type("new_password1");
    cy.findByLabelText("Confirm your password").type("new_password1");

    cy.button("Save").click();
    cy.contains("Invalid password");
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

      cy.visit("/account/profile");
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

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      cy.findByText("Password").should("not.exist");
    });
  });
});
