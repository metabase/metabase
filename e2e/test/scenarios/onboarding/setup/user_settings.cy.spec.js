const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { normal } = USERS;

const { first_name, last_name, email, password } = normal;

describe("user > settings", () => {
  const fullName = H.getFullName(normal);

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to remove first name and last name (metabase#22754)", () => {
    cy.visit("/account/profile");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Password").should("exist");
  });

  it("should redirect to the login page when the user has signed out but tries to visit `/account/profile` (metabase#15471)", () => {
    cy.signOut();
    cy.visit("/account/profile");
    cy.url().should("include", "/auth/login");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sign in to Metabase");
  });

  it("should redirect to the login page when the user has changed the password and logged out (metabase#18151)", () => {
    cy.visit("/account/password");

    cy.findByLabelText("Current password").type(password);
    cy.findByLabelText("Create a password").type(password);
    cy.findByLabelText("Confirm your password").type(password);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Success");

    H.getProfileLink().click();
    H.popover().findByText("Sign out").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("password is too common");
    cy.get("@passwordInput").clear();

    // Validate invalid current password
    cy.findByLabelText("Current password")
      .as("currentPassword")
      .type("invalid");

    cy.get("@passwordInput").type("new_password1");
    cy.findByLabelText("Confirm your password").type("new_password1");

    cy.button("Save").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Invalid password");
  });

  it("should be able to change a language (metabase#22192)", () => {
    cy.intercept("PUT", "/api/user/*").as("updateUserSettings");

    cy.visit("/account/profile");

    cy.findByTestId("user-locale-select").findByRole("textbox").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    H.popover().within(() => cy.findByText("Indonesian").click());

    cy.button("Update").click();
    cy.wait("@updateUserSettings");

    // Assert that the page reloaded with the new language
    cy.findByLabelText("Nama depan").should("exist");

    // We need some UI element other than a string, and cannot get by labels as they could be translated
    H.getProfileLink().should("exist");
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
            H.getProfileLink().should("exist");
          });
        },
      );
    });
  });

  it("should show correct translations when a user logs in with a locale that is different from the site locale", () => {
    cy.intercept("GET", "/api/user/current").as("getUser");
    cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale: "fr" });
    cy.signOut();
    cy.visit("/question/notebook");
    cy.wait("@getUser");
    cy.findByLabelText("Email address").type(email);
    cy.findByLabelText("Password").type(password);
    cy.button("Sign in").click();

    // should be redirected to new question page
    cy.wait("@getUser");
    H.miniPicker().findByText("Parcourir tout").click();
    H.pickEntity({ path: ["Nos analyses", "Orders Model"] });
    cy.findByTestId("step-summarize-0-0")
      .findByText("Summarize")
      .should("not.exist");
    cy.findByTestId("step-summarize-0-0").findByText("Résumer").should("exist");
  });

  describe("when user is authenticated via ldap", () => {
    beforeEach(() => {
      stubCurrentUser({ sso_source: "ldap" });

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Password").should("not.exist");
    });
  });

  describe("when user is authenticated via google", () => {
    beforeEach(() => {
      stubCurrentUser({ sso_source: "google" });

      cy.visit("/account/profile");
      cy.wait("@getUser");
    });

    it("should hide change password tab", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Password").should("not.exist");
    });

    it("should hide first name, last name, and email input (metabase#23298)", () => {
      cy.findByLabelText("First name").should("not.exist");
      cy.findByLabelText("Last name").should("not.exist");
      cy.findByLabelText("Email").should("not.exist");
    });
  });

  describe("dark mode", () => {
    const isMac = Cypress.platform === "darwin";
    const metaKey = isMac ? "Meta" : "Control";

    it("should toggle through light and dark mode when clicking on the label or icon", () => {
      cy.visit("/account/profile");

      cy.findByDisplayValue("Use system default").click();
      H.popover().findByText("Dark").click();
      assertDarkMode();

      cy.findByDisplayValue("Dark").click();
      H.popover().findByText("Light").click();
      assertLightMode();

      //Need to take focus off the inpout
      H.navigationSidebar().findByRole("link", { name: /Home/ }).click();
      cy.realPress([metaKey, "Shift", "L"]);
      assertDarkMode();
    });

    it("should persist theme selection on browser change", () => {
      cy.intercept("PUT", "/api/setting/color-scheme").as("saveSetting");

      cy.visit("/account/profile");

      cy.findByDisplayValue("Use system default").click();
      H.popover().findByText("Dark").click();
      assertDarkMode();

      cy.wait("@saveSetting");

      // emulate browser change by deleting localStorage values
      cy.window().then((win) => {
        win.sessionStorage.clear();
        win.localStorage.clear();
      });

      cy.visit("/account/profile");
      assertDarkMode();
    });

    it("should apply user's selected theme instead of browser's OS theme preference", () => {
      cy.visit("/account/profile");

      cy.findByDisplayValue("Use system default").click();
      H.popover().findByText("Light").click();

      assertLightMode();

      H.navigationSidebar().findByText("Our analytics").click();
      H.collectionTable().findByText("Orders").should("exist").click();

      cy.findByTestId("table-body").should("be.visible"); // wait for table to be rendered

      cy.window().then((win) => {
        H.getProfileLink()
          .findByText("RT")
          .should("exist")
          .then(($button) => {
            cy.wrap(win.getComputedStyle($button[0]).color).should(
              "eq",
              "rgba(7, 23, 34, 0.84)", // text-dark
            );
          });

        cy.findByTestId("viz-type-button").click();
        cy.findByTestId("sidebar-left")
          .findByText("Other charts")
          .then(($text) => {
            cy.wrap(win.getComputedStyle($text[0]).color).should(
              "eq",
              "rgba(7, 23, 34, 0.62)", // text-medium
            );
          });
      });

      H.goToProfile();
      cy.findByDisplayValue("Light").click();
      H.popover().findByText("Dark").click();

      H.openNavigationSidebar();
      H.navigationSidebar().findByText("Our analytics").click();
      H.collectionTable().findByText("Orders").should("exist").click();

      cy.findByTestId("table-body").should("be.visible"); // wait for table to be rendered

      cy.window().then((win) => {
        H.getProfileLink()
          .findByText("RT")
          .should("exist")
          .then(($button) => {
            cy.wrap(win.getComputedStyle($button[0]).color).should(
              "eq",
              "rgba(255, 255, 255, 0.95)", // text-dark
            );
          });

        cy.findByTestId("viz-type-button").click();
        cy.findByTestId("sidebar-left")
          .findByText("Other charts")
          .then(($text) => {
            cy.wrap(win.getComputedStyle($text[0]).color).should(
              "eq",
              "rgba(255, 255, 255, 0.69)", // text-medium
            );
          });
      });
    });

    it("should apply user's color scheme preference immediately after login (metabase#66874)", () => {
      // First, set the color scheme preference while logged in
      cy.intercept("PUT", "/api/setting/color-scheme").as("saveColorScheme");

      cy.visit("/account/profile", stubSystemColorScheme("dark"));
      cy.findByDisplayValue("Use system default").click();
      H.popover().findByText("Light").click();

      cy.wait("@saveColorScheme");

      assertLightMode();

      cy.signOut();
      cy.visit("/", stubSystemColorScheme("dark"));

      // Verify that the theme is restored to "auto" after sign out
      assertDarkMode();

      cy.intercept("GET", "/api/session/properties").as("sessionProperties");

      // Sign-in is done manually in order to test theme replacement throughout
      // react navigation, where no new metadata is passed or injected into the
      // window object, and the theme is purely updated from session properties
      cy.findByLabelText("Email address").type(email);
      cy.findByLabelText("Password").type(password);
      cy.button("Sign in").click();

      cy.wait("@sessionProperties");

      // Verify light mode is applied immediately after login
      assertLightMode();

      // Verify the theme selector shows the correct value
      cy.visit("/account/profile", stubSystemColorScheme("dark"));
      cy.findByDisplayValue("Light").should("exist");
    });
  });
});

// I wanted to examine the value of a color vairable, but it's hard to inspect hsla colors between local and CI.
// sometimes the alpha is a decimal value, sometimes it isnt...
const assertLightMode = () =>
  cy.get("body").should("have.css", "background-color", "rgb(249, 249, 250)");

const assertDarkMode = () =>
  cy.get("body").should("have.css", "background-color", "rgb(5, 14, 21)");

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

/**
 * Stub the system color scheme preference
 *
 * @param {boolean} prefersDark - Whether the system prefers dark mode
 * @returns {Object} - The stub object
 */
function stubSystemColorScheme(preferredColorScheme = "light") {
  return {
    onBeforeLoad: (win) => {
      cy.stub(win, "matchMedia").callsFake((query) => {
        return {
          matches: query === `(prefers-color-scheme: ${preferredColorScheme})`,
          media: query,
          addEventListener: cy.stub(),
          removeEventListener: cy.stub(),
          addListener: cy.stub(), // deprecated but sometimes needed
          removeListener: cy.stub(),
          dispatchEvent: cy.stub(),
        };
      });
    },
  };
}
