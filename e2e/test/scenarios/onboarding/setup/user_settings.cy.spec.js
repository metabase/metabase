import { restore, getFullName } from "e2e/support/helpers";
import { USERS } from "e2e/support/cypress_data";
import { AccountSettingsPage } from "e2e/pages/account-settings-page";

const { normal } = USERS;

const { first_name, last_name, email, password } = normal;

describe("user > settings", () => {
  const fullName = getFullName(normal);

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to remove first name and last name (metabase#22754)", () => {
    const page = new AccountSettingsPage().visit();

    page.header.verifyFullname(fullName);
    page.tabs.profileForm.fill({ firstName: "", lastName: "" }).submit();

    cy.reload();

    page.tabs.profileForm.verifyValues({ firstName: "", lastName: "" });
  });

  it("should show user details with disabled submit button", () => {
    const page = new AccountSettingsPage().visit();

    page.header.verifyFullname(fullName).verifyEmail(email);
    page.tabs.profileForm
      .verifyValues({
        firstName: first_name,
        lastName: last_name,
        email,
      })
      .verifySubmitDisabled();
  });

  it("should update the user without fetching memberships", () => {
    cy.intercept("GET", "/api/permissions/membership").as("membership");

    const page = new AccountSettingsPage().visit();
    page.tabs.profileForm
      .fill({ firstName: "John" })
      .submit()
      .verifyValues({ firstName: "John" });

    // It is hard and unreliable to assert that something didn't happen in Cypress
    // This solution was the only one that worked out of all others proposed in this SO topic: https://stackoverflow.com/a/59302542/8815185
    cy.get("@membership.all").should("have.length", 0);
  });

  it("should redirect to the login page when the user has changed the password and logged out (metabase#18151)", () => {
    const page = new AccountSettingsPage().visit();
    page
      .selectTab("Password")
      .tabs.passwordForm.fill({
        currentPassword: password,
        newPassword: password,
        newPasswordConfirmation: password,
      })
      .submit();

    page.navBar.signOut();

    cy.findByText("Sign in to Metabase");
  });

  it("should have a change password tab", () => {
    cy.intercept("GET", "/api/user/current").as("getUser");

    cy.visit("/account/profile");
    cy.wait("@getUser");
    cy.findByText("Password").should("exist");
  });

  it("should validate form values (metabase#23259)", () => {
    cy.signInAsNormalUser();

    const page = new AccountSettingsPage().visitPasswordTab();

    page.tabs.passwordForm.newPasswordInput
      .type("qwerty123")
      .blur()
      .verifyValidationMessage("password is too common.")
      .clear();

    page.tabs.passwordForm
      .fill({
        currentPassword: "invalid",
        newPassword: "new_password1",
        newPasswordConfirmation: "new_password1",
      })
      .submit();

    page.tabs.passwordForm.currentPasswordInput.verifyValidationMessage(
      "Invalid password",
    );
  });

  it("should be able to change a language (metabase#22192)", () => {
    const page = new AccountSettingsPage().visit();
    page.tabs.profileForm
      .verifyValues({ language: "Use site default" })
      .fill({ language: "Indonesian" })
      .submit()
      .verifyValues({ language: "Indonesian" });

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
