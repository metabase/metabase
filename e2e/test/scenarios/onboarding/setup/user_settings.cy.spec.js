import { USERS } from "e2e/support/cypress_data";
import { restore, popover, getFullName } from "e2e/support/helpers";

const { normal } = USERS;

const { first_name, last_name, email, password } = normal;

describe("user > settings", () => {
  const fullName = getFullName(normal);

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to remove first name and last name (metabase#22754)", () => {
    cy.visit("/account/profile");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Update").click();
    cy.findByDisplayValue("John");

    // It is hard and unreliable to assert that something didn't happen in Cypress
    // This solution was the only one that worked out of all others proposed in this SO topic: https://stackoverflow.com/a/59302542/8815185
    cy.get("@membership.all").should("have.length", 0);
  });

  it("should have a change password tab", () => {
    cy.intercept("GET", "/api/user/current").as("getUser");

    cy.visit("/account/profile");
    cy.wait("@getUser");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Password").should("exist");
  });

  it("should redirect to the login page when the user has signed out but tries to visit `/account/profile` (metabase#15471)", () => {
    cy.signOut();
    cy.visit("/account/profile");
    cy.url().should("include", "/auth/login");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in to Metabase");
  });

  it("should redirect to the login page when the user has changed the password and logged out (metabase#18151)", () => {
    cy.visit("/account/password");

    cy.findByLabelText("Current password").type(password);
    cy.findByLabelText("Create a password").type(password);
    cy.findByLabelText("Confirm your password").type(password);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Success");

    cy.findByLabelText("gear icon").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign out").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in to Metabase");
  });

  it("should validate form values (metabase#23259)", () => {
    cy.signInAsNormalUser();
    cy.visit("/account/password");

    // Validate common passwords
    cy.findByLabelText(/Create a password/i)
      .as("passwordInput")
      .type("qwerty123")
      .blur();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("password is too common");
    cy.get("@passwordInput").clear();

    // Validate invalid current password
    cy.findByLabelText("Current password")
      .as("currentPassword")
      .type("invalid");

    cy.get("@passwordInput").type("new_password1");
    cy.findByLabelText("Confirm your password").type("new_password1");

    cy.button("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Invalid password");
  });

  it("should be able to change a language (metabase#22192)", () => {
    cy.intercept("PUT", "/api/user/*").as("updateUserSettings");

    cy.visit("/account/profile");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Use site default").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
      stubCurrentUser({ ldap_auth: true });

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Password").should("not.exist");
    });
  });

  describe("when user is authenticated via google", () => {
    beforeEach(() => {
      stubCurrentUser({ google_auth: true });

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
      stubCurrentUser({ sso_source: "jwt" });

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
      stubCurrentUser({ sso_source: "saml" });
      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Password").should("not.exist");
    });

    it("should hide first name, last name, and email input (metabase#23298)", () => {
      cy.findByLabelText("First name").should("not.exist");
      cy.findByLabelText("Last name").should("not.exist");
      cy.findByLabelText("Email").should("not.exist");
    });
  });
});

/**
 * Stub the current user authentication method
 *
 * @param {Object} authenticationMethod
 */
function stubCurrentUser(authenticationMethod) {
  cy.request("GET", "/api/user/current").then(({ body: user }) => {
    cy.intercept(
      "GET",
      "/api/user/current",
      Object.assign({}, user, authenticationMethod),
    ).as("getUser");
  });
}
