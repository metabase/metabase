import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  openOrdersTable,
  popover,
  describeEE,
  setupMetabaseCloud,
  onlyOnOSS,
  isEE,
  isOSS,
  setTokenFeatures,
  undoToast,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  resetSnowplow,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describeWithSnowplow("scenarios > admin > settings", () => {
  beforeEach(() => {
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
  });

  it(
    "should prompt admin to migrate to a hosted instance",
    { tags: "@OSS" },
    () => {
      onlyOnOSS();
      cy.visit("/admin/settings/setup");

      cy.findByTestId("upsell-card").findByText(/Migrate to Metabase Cloud/);
      expectGoodSnowplowEvent({
        event: "upsell_viewed",
        promoted_feature: "hosting",
      });
      cy.findByTestId("upsell-card")
        .findAllByRole("link", { name: "Learn more" })
        .click();
      // link opens in new tab
      expectGoodSnowplowEvent({
        event: "upsell_clicked",
        promoted_feature: "hosting",
      });
      expectNoBadSnowplowEvents();
    },
  );

  it("should surface an error when validation for any field fails (metabase#4506)", () => {
    const BASE_URL = Cypress.config().baseUrl;
    const DOMAIN_AND_PORT = BASE_URL.replace("http://", "");

    cy.intercept("PUT", "/api/setting/site-url").as("url");

    cy.visit("/admin/settings/general");

    // Needed to strip down the protocol from URL to accomodate our UI (<select> PORT | <input> DOMAIN_AND_PORT)
    cy.findByDisplayValue(DOMAIN_AND_PORT) // findByDisplayValue comes from @testing-library/cypress
      .click()
      .type("foo", { delay: 100 })
      .blur();

    cy.wait("@url").should(({ response }) => {
      expect(response.statusCode).to.eq(500);
      // Switching to regex match for assertions - the test was flaky because of the "typing" issue
      // i.e. it sometimes doesn't type the whole string "foo", but only "oo".
      // We only care that the `cause` is starting with "Invalid site URL"
      expect(response.body.cause).to.match(/^Invalid site URL/);
    });

    // NOTE: This test is not concerned with HOW we style the error message - only that there is one.
    //       If we update UI in the future (for example: we show an error within a popup/modal), the test in current form could fail.
    cy.log("Making sure we display an error message in UI");
    // Same reasoning for regex as above
    undoToast().contains(/^Error: Invalid site URL/);
  });

  it("should save a setting", () => {
    cy.intercept("PUT", "**/admin-email").as("saveSettings");

    cy.visit("/admin/settings/general");

    // aliases don't last past refreshes, so create a function to grab the input
    // rather than aliasing it with .as()
    const emailInput = () =>
      cy
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    cy.intercept("GET", "**/api/health", "ok").as("httpsCheck");

    // settings have loaded, but there's no redirect setting visible
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Site URL");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Redirect to HTTPS").should("not.exist");

    // switch site url to use https
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Site URL")
      .parent()
      .parent()
      .findByTestId("select-button")
      .click();
    popover().contains("https://").click({ force: true });

    cy.wait("@httpsCheck");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Redirect to HTTPS").parent().parent().contains("Disabled");

    restore(); // avoid leaving https site url
  });

  it("should display an error if the https redirect check fails", () => {
    cy.visit("/admin/settings/general");

    cy.intercept("GET", "**/api/health", req => {
      req.reply({ forceNetworkError: true });
    }).as("httpsCheck");
    // switch site url to use https
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Site URL")
      .parent()
      .parent()
      .findByTestId("select-button")
      .click();
    popover().contains("https://").click({ force: true });

    cy.wait("@httpsCheck");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("It looks like HTTPS is not properly configured");
  });

  it("should correctly apply the globalized date formats (metabase#11394) and update the formatting", () => {
    cy.intercept("PUT", "**/custom-formatting").as("saveFormatting");

    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    cy.visit("/admin/settings/localization");

    cy.findByTestId("custom-formatting-setting")
      .findByText("January 31, 2018")
      .click({ force: true });

    popover().findByText("2018/1/31").click({ force: true });
    cy.wait("@saveFormatting");

    cy.findAllByTestId("select-button-content").should("contain", "2018/1/31");

    cy.findByTestId("custom-formatting-setting")
      .findByText("17:24 (24-hour clock)")
      .click();
    cy.wait("@saveFormatting");
    cy.findByDisplayValue("HH:mm").should("be.checked");

    openOrdersTable({ limit: 2 });

    cy.findByTextEnsureVisible("Created At");
    cy.get("[data-testid=cell-data]")
      .should("contain", "Created At")
      .and("contain", "2025/2/11, 21:40");

    // Go back to the settings and reset the time formatting
    cy.visit("/admin/settings/localization");

    cy.findByTestId("custom-formatting-setting")
      .findByText("5:24 PM (12-hour clock)")
      .click();

    cy.wait("@saveFormatting");
    cy.findByDisplayValue("h:mm A").should("be.checked");

    openOrdersTable({ limit: 2 });

    cy.findByTextEnsureVisible("Created At");
    cy.get("[data-testid=cell-data]").and("contain", "2025/2/11, 9:40 PM");
  });

  it("should show where to display the unit of currency (metabase#table-metadata-missing-38021 and update the formatting", () => {
    // Set the semantic type of total to currency
    cy.request("PUT", `/api/field/${ORDERS.TOTAL}`, {
      semantic_type: "type/Currency",
    });

    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.TOTAL}/formatting`,
    );

    cy.findByTestId("admin-layout-content").within(() => {
      // Assert that this option now exists
      cy.findByText("Where to display the unit of currency");
      cy.findByText("In every table cell").click();
    });

    // Open the orders table
    openOrdersTable({ limit: 2 });

    cy.get("#main-data-grid").within(() => {
      // Items in the total column should have a leading dollar sign
      cy.findByText("$39.72");
      cy.findByText("$117.03");
    });
  });

  it("should search for and select a new timezone", () => {
    cy.intercept("PUT", "**/report-timezone").as("reportTimezone");

    cy.visit("/admin/settings/localization");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Report Timezone")
      .closest("li")
      .findByTestId("report-timezone-select-button")
      .click();

    cy.findByPlaceholderText("Find...").type("Centr");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("US/Central").click({ force: true });

    cy.wait("@reportTimezone");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("US/Central");
  });

  it("'General' admin settings should handle setup via `MB_SITE_URL` environment variable (metabase#14900)", () => {
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
      cy.intercept("GET", "/api/setting", req => {
        req.reply({ body: STUBBED_BODY });
      }).as("appSettings");
    });
    cy.visit("/admin/settings/general");

    cy.wait("@appSettings");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("We're a little lost...").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Site name/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Site URL/i);
  });

  it(
    "should display the order of the settings items consistently between OSS/EE versions (metabase#15441)",
    { tags: "@OSS" },
    () => {
      isEE && setTokenFeatures("all");

      const lastItem = isOSS ? "Cloud" : "Appearance";

      cy.visit("/admin/settings/setup");
      cy.findByTestId("admin-list-settings-items").within(() => {
        cy.findAllByTestId("settings-sidebar-link").as("settingsOptions");
        cy.get("@settingsOptions").first().contains("Setup");
        cy.get("@settingsOptions").last().contains(lastItem);
      });
    },
  );

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should hide self-hosted settings when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/settings/general");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Site Name");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Site URL").should("not.exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Email").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Updates").should("not.exist");
  });

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should hide the store link when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/settings/general");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase Admin");
    cy.findByLabelText("store icon").should("not.exist");
  });

  describe(" > slack settings", () => {
    it("should present the form and display errors", () => {
      cy.visit("/admin/settings/slack");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Metabase on Slack");
      cy.findByLabelText("Slack Bot User OAuth Token").type("xoxb");
      cy.findByLabelText("Public channel to store image files").type(
        "metabase_files",
      );
      cy.button("Save changes").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(": invalid token");
    });
  });
});

describe("scenarios > admin > settings (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore();
    cy.signInAsAdmin();
  });

  it("should show the store link when running Metabase OSS", () => {
    cy.visit("/admin/settings/general");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase Admin");
    cy.findByLabelText("store icon");
  });
});

describeEE("scenarios > admin > settings (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should hide Enterprise page when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/settings/general");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Site Name");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Enterprise").should("not.exist");
  });

  it("should hide the store link when running Metabase EE", () => {
    cy.visit("/admin/settings/general");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase Admin");
    cy.findByLabelText("store icon").should("not.exist");
  });
});
