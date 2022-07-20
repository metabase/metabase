// Migrated from frontend/test/metabase/user/UserSettings.integ.spec.js
import { restore, popover } from "__support__/e2e/helpers";
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
  const fullName = `${first_name} ${last_name}`;

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to remove first name and last name (metabase#22754)", () => {
    cy.visit("/account/profile");
    cy.findByText(fullName);
    cy.findByLabelText("First name").clear();
    cy.findByLabelText("Last name").clear();
    cy.button("Update").click();

    cy.reload();

    cy.findByLabelText("First name").should("be.empty");
    cy.findByLabelText("Last name").should("be.empty");
  });

  it("should show user details with disabled submit button", () => {
    cy.visit("/account/profile");
    cy.findByTestId("account-header").within(() => {
      cy.findByText(fullName);
      cy.findByText(email);
    });
    cy.findByDisplayValue(first_name);
    cy.findByDisplayValue(last_name);
    cy.findByDisplayValue(email);
    cy.button("Update").should("be.disabled");
  });

  it("should update the user without fetching memberships", () => {
    cy.intercept("GET", "/api/permissions/membership").as("membership");
    cy.visit("/account/profile");
    cy.findByDisplayValue(first_name).click().clear().type("John");
    cy.findByText("Update").click();
    cy.findByDisplayValue("John");

    // It is hard and unreliable to assert that something didn't happen in Cypress
    // This solution was the only one that worked out of all others proposed in this SO topic: https://stackoverflow.com/a/59302542/8815185
    cy.get("@membership").then(() => {
      expect(requestsCount("membership")).to.have.length(0);
    });
  });

  it("should have a change password tab", () => {
    cy.intercept("GET", "/api/user/current").as("getUser");

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

  it("should be able to change a language (metabase#22192)", () => {
    cy.intercept("PUT", "/api/user/*").as("updateUserSettings");

    cy.visit("/account/profile");

    cy.findByText("Use site default").click();
    popover().within(() => cy.findByText("Indonesian").click());

    cy.button("Update").click();
    cy.wait("@updateUserSettings");

    // Assert that the page reloaded with the new language
    cy.findByLabelText("Nama depan").should("exist");

    // We need some UI element other than a string
    cy.icon("gear").should("exist");
  });

  it("should be able to open the app with every locale from the available locales (metabase#22192)", () => {
    cy.request("GET", "/api/user/current").then(({ body: user }) => {
      cy.intercept("GET", "/api/user/current").as("getUser");

      cy.request("GET", "/api/session/properties").then(
        ({ body: settings }) => {
          cy.wrap(settings["available-locales"]).each(([locale]) => {
            cy.log(`Using ${locale} locale`);
            cy.request("PUT", `/api/user/${user.id}`, { locale });
            cy.visit("/");
            cy.wait("@getUser");
            cy.icon("gear").should("exist");
          });
        },
      );
    });
  });

  describe("when user is authenticated via ldap", () => {
    beforeEach(() => {
      cy.intercept(
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
      cy.intercept(
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

    it("should hide first name, last name, and email input (metabase#23298)", () => {
      cy.findByLabelText("First name").should("not.exist");
      cy.findByLabelText("Last name").should("not.exist");
      cy.findByLabelText("Email").should("not.exist");
    });
  });

  describe("when user is authenticated via JWT", () => {
    beforeEach(() => {
      cy.intercept(
        "GET",
        "/api/user/current",
        Object.assign({}, CURRENT_USER, {
          sso_source: "jwt",
        }),
      ).as("getUser");

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      cy.findByText("Password").should("not.exist");
    });

    it("should hide first name, last name, and email input (metabase#23298)", () => {
      cy.findByLabelText("First name").should("not.exist");
      cy.findByLabelText("Last name").should("not.exist");
      cy.findByLabelText("Email").should("not.exist");
    });
  });

  describe("when user is authenticated via SAML", () => {
    beforeEach(() => {
      cy.intercept(
        "GET",
        "/api/user/current",
        Object.assign({}, CURRENT_USER, {
          sso_source: "saml",
        }),
      ).as("getUser");

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      cy.findByText("Password").should("not.exist");
    });

    it("should hide first name, last name, and email input (metabase#23298)", () => {
      cy.findByLabelText("First name").should("not.exist");
      cy.findByLabelText("Last name").should("not.exist");
      cy.findByLabelText("Email").should("not.exist");
    });
  });
});
