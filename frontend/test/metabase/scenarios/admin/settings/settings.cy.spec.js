import {
  restore,
  openOrdersTable,
  popover,
  describeEE,
  setupMetabaseCloud,
  isOSS,
  isEE,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS } = SAMPLE_DATABASE;

describe("scenarios > admin > settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it(
    "should prompt admin to migrate to the hosted instance",
    { tags: "@OSS" },
    () => {
      cy.onlyOn(isOSS);
      cy.visit("/admin/settings/setup");
      cy.findByText("Have your server maintained for you.");
      cy.findByText("Migrate to Metabase Cloud.");
      cy.findAllByRole("link", { name: "Learn more" })
        .should("have.attr", "href")
        .and("include", "/migrate/");
    },
  );

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

    cy.wait("@url").should(xhr => {
      expect(xhr.status).to.eq(500);
      // Switching to regex match for assertions - the test was flaky because of the "typing" issue
      // i.e. it sometimes doesn't type the whole string "foo", but only "oo".
      // We only care that the `cause` is starting with "Invalid site URL"
      expect(xhr.response.body.cause).to.match(/^Invalid site URL/);
    });

    // NOTE: This test is not concerned with HOW we style the error message - only that there is one.
    //       If we update UI in the future (for example: we show an error within a popup/modal), the test in current form could fail.
    cy.log("Making sure we display an error message in UI");
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
    cy.findByText("Save changes");

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
      .type("other.email@metabase.test")
      .blur();
    cy.wait("@saveSettings");

    cy.visit("/admin/settings/general");
    // after we refreshed, the field should still be "other.email"
    emailInput().should("have.value", "other.email@metabase.test");
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
      .findByTestId("select-button")
      .click();
    popover().contains("https://").click({ force: true });

    cy.wait("@httpsCheck");
    cy.contains("Redirect to HTTPS").parent().parent().contains("Disabled");

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
      .findByTestId("select-button")
      .click();
    popover().contains("https://").click({ force: true });

    cy.wait("@httpsCheck");
    cy.contains("It looks like HTTPS is not properly configured");
    restore(); // avoid leaving https site url
  });

  it("should correctly apply the globalized date formats (metabase#11394) and update the formatting", () => {
    cy.intercept("PUT", "**/custom-formatting").as("saveFormatting");

    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    cy.visit("/admin/settings/localization");

    cy.findByText("January 7, 2018").click({ force: true });
    cy.findByText("2018/1/7").click({ force: true });
    cy.wait("@saveFormatting");
    cy.findAllByTestId("select-button-content").should("contain", "2018/1/7");

    cy.findByText("17:24 (24-hour clock)").click();
    cy.wait("@saveFormatting");
    cy.findByDisplayValue("HH:mm").should("be.checked");

    openOrdersTable({ limit: 2 });

    cy.findByTextEnsureVisible("Created At");
    cy.get(".cellData")
      .should("contain", "Created At")
      .and("contain", "2019/2/11, 21:40");

    // Go back to the settings and reset the time formatting
    cy.visit("/admin/settings/localization");

    cy.findByText("5:24 PM (12-hour clock)").click();
    cy.wait("@saveFormatting");
    cy.findByDisplayValue("h:mm A").should("be.checked");

    openOrdersTable({ limit: 2 });

    cy.findByTextEnsureVisible("Created At");
    cy.get(".cellData").and("contain", "2019/2/11, 9:40 PM");
  });

  it("should search for and select a new timezone", () => {
    cy.server();
    cy.route("PUT", "**/report-timezone").as("reportTimezone");

    cy.visit("/admin/settings/localization");
    cy.contains("Report Timezone")
      .closest("li")
      .findByTestId("report-timezone-select-button")
      .click();

    cy.findByPlaceholderText("Find...").type("Centr");
    cy.findByText("US/Central").click({ force: true });

    cy.wait("@reportTimezone");
    cy.contains("US/Central");
  });

  it("'General' admin settings should handle setup via `MB_SITE_ULR` environment variable (metabase#14900)", () => {
    cy.server();
    // 1. Get the array of ALL available settings
    cy.request("GET", "/api/setting").then(({ body }) => {
      // 2. Create a stubbed version of that array by passing modified "site-url" settings
      const STUBBED_BODY = body.map(setting => {
        if (setting.key === "site-url") {
          const STUBBED_SITE_URL = Object.assign({}, setting, {
            is_env_setting: true,
            value: null,
          });

          return STUBBED_SITE_URL;
        }
        return setting;
      });

      // 3. Stub the whole response
      cy.route("GET", "/api/setting", STUBBED_BODY).as("appSettings");
    });
    cy.visit("/admin/settings/general");

    cy.wait("@appSettings");
    cy.findByText("We're a little lost...").should("not.exist");
    cy.findByText(/Site name/i);
    cy.findByText(/Site URL/i);
  });

  it(
    "should display the order of the settings items consistently between OSS/EE versions (metabase#15441)",
    { tags: "@OSS" },
    () => {
      const lastItem = isEE ? "Appearance" : "Caching";

      cy.visit("/admin/settings/setup");
      cy.get(".AdminList .AdminList-item")
        .as("settingsOptions")
        .first()
        .contains("Setup");
      cy.get("@settingsOptions").last().contains(lastItem);
    },
  );

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should hide self-hosted settings when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/settings/general");

    cy.findByText("Site Name");
    cy.findByText("Site URL").should("not.exist");

    cy.findByText("Email").should("not.exist");
    cy.findByText("Updates").should("not.exist");
  });

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should hide the store link when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/settings/general");

    cy.findByText("Metabase Admin");
    cy.findByLabelText("store icon").should("not.exist");
  });

  describe(" > slack settings", () => {
    it("should present the form and display errors", () => {
      cy.visit("/admin/settings/slack");

      cy.findByText("Metabase on Slack");
      cy.findByLabelText("Slack Bot User OAuth Token").type("xoxb");
      cy.findByLabelText("Slack channel name").type("metabase_files");
      cy.button("Save changes").click();

      cy.findByText(": invalid token");
    });
  });
});

describe("scenarios > admin > settings (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    cy.onlyOn(isOSS);
    restore();
    cy.signInAsAdmin();
  });

  it("should show the store link when running Metabase OSS", () => {
    cy.visit("/admin/settings/general");

    cy.findByText("Metabase Admin");
    cy.findByLabelText("store icon");
  });
});

describeEE("scenarios > admin > settings (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should hide Enterprise page when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/settings/general");

    cy.findByText("Site Name");
    cy.findByText("Enterprise").should("not.exist");
  });

  it("should hide the store link when running Metabase EE", () => {
    cy.visit("/admin/settings/general");

    cy.findByText("Metabase Admin");
    cy.findByLabelText("store icon").should("not.exist");
  });
});

function configureAuth(providerTitle) {
  cy.findByText(providerTitle)
    .closest(".rounded.bordered")
    .contains("Configure")
    .click();
}
