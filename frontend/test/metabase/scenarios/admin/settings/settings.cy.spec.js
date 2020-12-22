import {
  signInAsAdmin,
  restore,
  openOrdersTable,
  version,
  popover,
} from "__support__/cypress";

describe("scenarios > admin > settings", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should surface an error when validation for any field fails (metabase#4506)", () => {
    const BASE_URL = Cypress.config().baseUrl;
    const DOMAIN_AND_PORT = BASE_URL.replace("http://", "");

    cy.server();
    cy.route("PUT", "/api/setting/site-url").as("url");

    cy.visit("/admin/settings/general");

    // Needed to strip down the protocol from URL to accomodate our UI (<select> PORT | <input> DOMAIN_AND_PORT)
    cy.findByDisplayValue(DOMAIN_AND_PORT) // findByDisplayValue comes from @testing-library/cypress
      .click()
      .type("foo", { delay: 100 })
      .blur();

    cy.wait("@url")
      .wait("@url") // cy.wait("@url.2") doesn't work for some reason
      .should(xhr => {
        expect(xhr.status).to.eq(500);
        // Switching to regex match for assertions - the test was flaky because of the "typing" issue
        // i.e. it sometimes doesn't type the whole string "foo", but only "oo".
        // We only care that the `cause` is starting with "Invalid site URL"
        expect(xhr.response.body.cause).to.match(/^Invalid site URL/);
      });

    // NOTE: This test is not concerned with HOW we style the error message - only that there is one.
    //       If we update UI in the future (for example: we show an error within a popup/modal), the test in current form could fail.
    cy.log("**Making sure we display an error message in UI**");
    // Same reasoning for regex as above
    cy.get(".SaveStatus").contains(/^Error: Invalid site URL/);
  });

  it("should render the proper auth options", () => {
    // Ported from `SettingsAuthenticationOptions.e2e.spec.js`
    // Google sign in
    cy.visit("/admin/settings/authentication");

    configureAuth("Sign in with Google");

    cy.contains(
      "To allow users to sign in with Google you'll need to give Metabase a Google Developers console application client ID.",
    );
    // *** should be 'Save changes'
    cy.findByText("Save Changes");

    // SSO
    cy.visit("/admin/settings/authentication");

    configureAuth("LDAP");

    cy.findByText("LDAP Authentication");
    cy.findByText("User Schema");
    cy.findByText("Save changes");
  });

  it("should save a setting", () => {
    cy.server();
    cy.route("PUT", "**/admin-email").as("saveSettings");

    cy.visit("/admin/settings/general");

    // aliases don't last past refreshes, so create a function to grab the input
    // rather than aliasing it with .as()
    const emailInput = () =>
      cy
        .contains("Email Address for Help Requests")
        .parent()
        .parent()
        .find("input");

    // extremely ugly hack because nothing else worked
    // for some reason, Cypress failed to clear this field quite often disrupting our CI
    emailInput()
      .click()
      .clear()
      .type("abc", { delay: 50 })
      .clear()
      .click()
      .type("other.email@metabase.com")
      .blur();
    cy.wait("@saveSettings");

    cy.visit("/admin/settings/general");
    // after we refreshed, the field should still be "other.email"
    emailInput().should("have.value", "other.email@metabase.com");

    // reset the email
    cy.request("PUT", "/api/setting/admin-email", {
      value: "bob@metabase.com",
    });
  });

  it("should check for working https before enabling a redirect", () => {
    cy.visit("/admin/settings/general");
    cy.server();
    cy.route("GET", "**/api/health", "ok").as("httpsCheck");

    // settings have loaded, but there's no redirect setting visible
    cy.contains("Site URL");
    cy.contains("Redirect to HTTPS").should("not.exist");

    // switch site url to use https
    cy.contains("Site URL")
      .parent()
      .parent()
      .find(".AdminSelect")
      .click();
    popover()
      .contains("https://")
      .click();

    cy.wait("@httpsCheck");
    cy.contains("Redirect to HTTPS")
      .parent()
      .parent()
      .contains("Disabled");

    restore(); // avoid leaving https site url
  });

  it("should display an error if the https redirect check fails", () => {
    cy.visit("/admin/settings/general");
    cy.server();
    // return 500 on https check
    cy.route({ method: "GET", url: "**/api/health", status: 500 }).as(
      "httpsCheck",
    );

    // switch site url to use https
    cy.contains("Site URL")
      .parent()
      .parent()
      .find(".AdminSelect")
      .click();
    popover()
      .contains("https://")
      .click();

    cy.wait("@httpsCheck");
    cy.contains("It looks like HTTPS is not properly configured");
    restore(); // avoid leaving https site url
  });

  it("should update the formatting", () => {
    cy.server();
    cy.route("PUT", "**/custom-formatting").as("saveFormatting");

    // update the formatting
    cy.visit("/admin/settings/localization");
    cy.contains("17:24 (24-hour clock)").click();
    cy.wait("@saveFormatting");

    // check the new formatting in a question
    openOrdersTable();
    cy.contains(/^February 11, 2019, 21:40$/).debug();

    // reset the formatting
    cy.visit("/admin/settings/localization");
    cy.contains("5:24 PM (12-hour clock)").click();
    cy.wait("@saveFormatting");

    // check the reset formatting in a question
    openOrdersTable();
    cy.contains(/^February 11, 2019, 9:40 PM$/);
  });

  if (version.edition !== "enterprise") {
    describe(" > embedding settings", () => {
      it("should validate a premium embedding token has a valid format", () => {
        cy.server();
        cy.route("PUT", "/api/setting/premium-embedding-token").as(
          "saveEmbeddingToken",
        );

        cy.visit("/admin/settings/embedding_in_other_applications");
        cy.contains("Premium embedding");
        cy.contains("Enter a token").click();

        // Try an invalid token format
        cy.contains("Enter the token")
          .next()
          .type("Hi")
          .blur();
        cy.wait("@saveEmbeddingToken").then(({ response }) => {
          expect(response.body).to.equal(
            "Token format is invalid. Token should be 64 hexadecimal characters.",
          );
        });
        cy.contains("Token format is invalid.");
      });

      it("should validate a premium embedding token exists", () => {
        cy.server();
        cy.route("PUT", "/api/setting/premium-embedding-token").as(
          "saveEmbeddingToken",
        );

        cy.visit("/admin/settings/embedding_in_other_applications");
        cy.contains("Premium embedding");
        cy.contains("Enter a token").click();

        // Try a valid format, but an invalid token
        cy.contains("Enter the token")
          .next()
          .type(
            "11397b1e60cfb1372f2f33ac8af234a15faee492bbf5c04d0edbad76da3e614a",
          )
          .blur();
        cy.wait("@saveEmbeddingToken").then(({ response }) => {
          expect(response.body).to.equal(
            "Unable to validate token: 404 not found.",
          );
        });
        cy.contains("Unable to validate token: 404 not found.");
      });

      it("should be able to set a premium embedding token", () => {
        // A random embedding token with valid format
        const embeddingToken =
          "11397b1e60cfb1372f2f33ac8af234a15faee492bbf5c04d0edbad76da3e614a";

        cy.server();
        cy.route({
          method: "PUT",
          url: "/api/setting/premium-embedding-token",
          response: embeddingToken,
        }).as("saveEmbeddingToken");

        cy.visit("/admin/settings/embedding_in_other_applications");
        cy.contains("Premium embedding");
        cy.contains("Enter a token").click();

        cy.route("GET", "/api/session/properties").as("getSessionProperties");
        cy.route({
          method: "GET",
          url: "/api/setting",
          response: [
            { key: "enable-embedding", value: true },
            { key: "embedding-secret-key", value: embeddingToken },
            { key: "premium-embedding-token", value: embeddingToken },
          ],
        }).as("getSettings");

        cy.contains("Enter the token")
          .next()
          .type(embeddingToken)
          .blur();
        cy.wait("@saveEmbeddingToken").then(({ response }) => {
          expect(response.body).to.equal(embeddingToken);
        });
        cy.wait("@getSessionProperties");
        cy.wait("@getSettings");
        cy.contains("Premium embedding enabled");
      });
    });
  }

  describe(" > email settings", () => {
    it("should be able to save email settings", () => {
      cy.visit("/admin/settings/email");
      cy.findByPlaceholderText("smtp.yourservice.com")
        .type("localhost")
        .blur();
      cy.findByPlaceholderText("587")
        .type("1234")
        .blur();
      cy.findByPlaceholderText("metabase@yourcompany.com")
        .type("admin@metabase.com")
        .blur();
      cy.findByText("Save changes").click();

      cy.findByText("Changes saved!");
    });
    it("should show an error if test email fails", () => {
      cy.visit("/admin/settings/email");
      cy.findByText("Send test email").click();
      cy.findByText("Sorry, something went wrong. Please try again.");
    });
    it("should be able to clear email settings", () => {
      cy.visit("/admin/settings/email");
      cy.findByText("Clear").click();
      cy.findByPlaceholderText("smtp.yourservice.com").should("have.value", "");
      cy.findByPlaceholderText("587").should("have.value", "");
      cy.findByPlaceholderText("metabase@yourcompany.com").should(
        "have.value",
        "",
      );
    });
  });

  describe(" > slack settings", () => {
    it("should present the form and display errors", () => {
      cy.visit("/admin/settings/slack");
      cy.contains("Answers sent right to your Slack");
      cy.findByPlaceholderText("Enter the token you received from Slack")
        .type("not-a-real-token")
        .blur();
      cy.findByText("Save changes").click();
      cy.contains("Looks like we ran into some problems");
    });
  });
});

function configureAuth(providerTitle) {
  cy.findByText(providerTitle)
    .closest(".rounded.bordered")
    .contains("Configure")
    .click();
}
