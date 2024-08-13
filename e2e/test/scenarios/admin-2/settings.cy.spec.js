import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WEBMAIL_CONFIG,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
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
  openNativeEditor,
  runNativeQuery,
  modal,
  setupSMTP,
  main,
  echartsContainer,
  visitQuestion,
  visitQuestionAdhoc,
  tableHeaderClick,
  mockSessionPropertiesTokenFeatures,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { SMTP_PORT, WEB_PORT } = WEBMAIL_CONFIG;

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

/**
 * Disabled and quarantined until we fix the caching issues, and especially:
 * https://github.com/metabase/metabase/issues/13262
 */
describe.skip(
  "scenarios > admin > settings > cache",
  { tags: "@external" },
  () => {
    function enableCaching() {
      cy.findByText("Disabled")
        .parent()
        .within(() => {
          cy.findByRole("switch").click();
        });

      cy.findByText("Enabled");
    }

    function setCachingValue(field, value) {
      cy.findByText(field).closest("li").find("input").type(value).blur();
    }

    function saveQuestion(name) {
      cy.intercept("POST", "/api/card").as("saveQuestion");

      cy.findByText("Save").click();

      cy.findByLabelText("Name").type(name);

      modal().button("Save").click();

      cy.findByText("Not now").click();

      cy.wait("@saveQuestion");
    }

    function getCellText() {
      return cy.get("[data-testid=cell-data]").eq(-1).invoke("text");
    }

    function refresh() {
      cy.icon("refresh").first().click();
      cy.wait("@cardQuery");
    }

    function refreshUntilCached(loop = 0) {
      if (loop > 5) {
        throw new Error("Caching mechanism seems to be broken.");
      }

      refresh();

      getCellText().then(res => {
        cy.get("@tempResult").then(temp => {
          if (res === temp) {
            cy.wrap(res).as("cachedResult");
          } else {
            cy.wrap(res).as("tempResult");

            refreshUntilCached(++loop);
          }
        });
      });
    }
    const nativeQuery = "select (random() * random() * random()), pg_sleep(2)";
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      restore("postgres-12");
      cy.signInAsAdmin();
    });

    describe("issue 18458", () => {
      beforeEach(() => {
        cy.visit("/admin/settings/caching");

        enableCaching();

        setCachingValue("Minimum Query Duration", "1");
        setCachingValue("Cache Time-To-Live (TTL) multiplier", "2");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Saved");

        // Run the query and save the question
        openNativeEditor({ databaseName: "QA Postgres12" }).type(nativeQuery);
        runNativeQuery();

        getCellText().then(res => {
          cy.wrap(res).as("tempResult");
        });

        saveQuestion("18458");
      });

      it("should respect previously set cache duration (metabase#18458)", () => {
        refreshUntilCached();

        cy.get("@cachedResult").then(cachedValue => {
          /**
           * 5s is longer than what we set the cache to last:
           * Approx 2s for an Average Runtime x multiplier of 2.
           *
           * The cache should expire after 4s and we should see a new random result.
           */
          cy.wait(5000);

          refresh();

          getCellText().then(newValue => {
            expect(newValue).to.not.eq(cachedValue);
          });
        });
      });
    });
  },
);

describe("Cloud settings section", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be visible when running Metabase Cloud", () => {
    // Setting to none will give us an instance where token-features.hosting is set to true
    // Allowing us to pretend that we are a hosted instance (seems backwards though haha)

    setTokenFeatures("none");
    cy.visit("/admin");
    cy.findByTestId("admin-list-settings-items").findByText("Cloud").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Cloud Settings/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Go to the Metabase Store").should(
      "have.attr",
      "href",
      "https://store.metabase.com/",
    );
  });

  it("should prompt us to migrate to cloud if we are not hosted", () => {
    setTokenFeatures("all");
    cy.visit("/admin");
    cy.findByTestId("admin-list-settings-items").findByText("Cloud").click();

    cy.location("pathname").should("contain", "/admin/settings/cloud");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Migrate to Cloud/i).should("exist");
    cy.button("Get started").should("exist");
  });
});

describe("scenarios > admin > settings > email settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to save and clear email settings", () => {
    // first time SMTP setup should redirect user to SMTP connection form
    // at "/admin/settings/email/smtp"
    cy.visit("/admin/settings/email");
    cy.url().should(
      "equal",
      Cypress.config().baseUrl + "/admin/settings/email/smtp",
    );

    // SMTP connection setup
    cy.findByLabelText("SMTP Host").type("localhost").blur();
    cy.findByLabelText("SMTP Port").type(SMTP_PORT).blur();
    cy.findByLabelText("SMTP Username").type("admin").blur();
    cy.findByLabelText("SMTP Password").type("admin").blur();

    // SMTP settings need to manually be saved
    cy.intercept("PUT", "api/email").as("smtpSaved");
    main().within(() => {
      cy.findByText("Save changes").click();
    });
    cy.wait("@smtpSaved");

    // after first time setup, user is redirected top-level page
    // which contains additional email settings
    cy.url().should(
      "equal",
      Cypress.config().baseUrl + "/admin/settings/email",
    );
    cy.findByTestId("smtp-connection-card").should("exist");

    // Non SMTP-settings should save automatically
    cy.findByLabelText("From Address").type("mailer@metabase.test").blur();
    cy.findByLabelText("From Name").type("Sender Name").blur();
    cy.findByLabelText("Reply-To Address")
      .type("reply-to@metabase.test")
      .blur();

    // Refresh page to confirm changes persist
    cy.reload();

    // validate that there is no-redirect after initial setup
    cy.url().should(
      "equal",
      Cypress.config().baseUrl + "/admin/settings/email",
    );

    // validate additional settings
    cy.findByDisplayValue("mailer@metabase.test");
    cy.findByDisplayValue("Sender Name");
    cy.findByDisplayValue("reply-to@metabase.test");

    // validate SMTP connection settings
    cy.findByTestId("smtp-connection-card")
      .findByText("Edit Configuration")
      .click();
    cy.findByDisplayValue("localhost");
    cy.findByDisplayValue(SMTP_PORT);
    cy.findAllByDisplayValue("admin");

    // breadcrumbs should now show up since it is not a first time configuration
    // and should back navigate to top-level email settings
    cy.findByTestId("breadcrumbs").findByText("Email").click();
    cy.url().should(
      "equal",
      Cypress.config().baseUrl + "/admin/settings/email",
    );

    cy.findByTestId("smtp-connection-card")
      .findByText("Edit Configuration")
      .click();

    // should not offer to save email changes when there aren't any (metabase#14749)
    cy.button("Save changes").should("be.disabled");

    // should be able to clear email settings
    main().findByText("Clear").click();

    cy.reload();

    cy.findByLabelText("SMTP Host").should("have.value", "");
    cy.findByLabelText("SMTP Port").should("have.value", "");
    cy.findByLabelText("SMTP Username").should("have.value", "");
    cy.findByLabelText("SMTP Password").should("have.value", "");
    cy.findByTestId("breadcrumbs").should("not.exist");
  });

  it("should show an error if test email fails", () => {
    // Reuse Email setup without relying on the previous test
    cy.request("PUT", "/api/setting", {
      "email-from-address": "admin@metabase.test",
      "email-from-name": "Metabase Admin",
      "email-reply-to": ["reply-to@metabase.test"],
      "email-smtp-host": "localhost",
      "email-smtp-password": null,
      "email-smtp-port": "1234",
      "email-smtp-security": "none",
      "email-smtp-username": null,
    });
    cy.visit("/admin/settings/email/smtp");
    main().findByText("Send test email").click();
    cy.findAllByText(
      "Couldn't connect to host, port: localhost, 1234; timeout -1",
    );
  });

  it(
    "should send a test email for a valid SMTP configuration",
    { tags: "@external" },
    () => {
      setupSMTP();
      cy.visit("/admin/settings/email/smtp");
      main().findByText("Send test email").click();
      main().findByText("Sent!");

      cy.request("GET", `http://localhost:${WEB_PORT}/email`).then(
        ({ body }) => {
          const emailBody = body[0].text;
          expect(emailBody).to.include("Your Metabase emails are working");
        },
      );
    },
  );
});

describe("scenarios > admin > license and billing", () => {
  const HOSTING_FEATURE_KEY = "hosting";
  const STORE_MANAGED_FEATURE_KEY = "metabase-store-managed";
  const NO_UPSELL_FEATURE_HEY = "no-upsell";
  // mocks data the will be returned by enterprise useLicense hook
  const mockBillingTokenFeatures = features => {
    return cy.intercept("GET", "/api/premium-features/token/status", {
      "valid-thru": "2099-12-31T12:00:00",
      valid: true,
      trial: false,
      features,
      status: "something",
    });
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describeEE("store info", () => {
    it("should show the user a link to the store for an unlincensed enterprise instance", () => {
      cy.visit("/admin/settings/license");
      cy.findByTestId("license-and-billing-content")
        .findByText("Go to the Metabase Store")
        .should("have.prop", "tagName", "A");
    });

    it("should show the user store info for an self-hosted instance managed by the store", () => {
      setTokenFeatures("all");
      mockBillingTokenFeatures([
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
      ]);

      const harborMasterConnectedAccount = {
        email: "ci-admins@metabase.com",
        first_name: "CI",
        last_name: "Admins",
        password: "test-password-123",
      };

      // create an admin user who is also connected to our test harbormaster account
      cy.request("GET", "/api/permissions/group")
        .then(({ body: groups }) => {
          const adminGroup = groups.find(g => g.name === "Administrators");
          return cy
            .createUserFromRawData(harborMasterConnectedAccount)
            .then(user => Promise.resolve([adminGroup.id, user]));
        })
        .then(([adminGroupId, user]) => {
          const data = { user_id: user.id, group_id: adminGroupId };
          return cy
            .request("POST", "/api/permissions/membership", data)
            .then(() => Promise.resolve(user));
        })
        .then(user => {
          cy.signOut(); // stop being normal admin user and be store connected admin user
          return cy.request("POST", "/api/session", {
            username: user.email,
            password: harborMasterConnectedAccount.password,
          });
        })
        .then(() => {
          // core test
          cy.visit("/admin/settings/license");
          cy.findByTestId("billing-info-key-plan").should("exist");
          cy.findByTestId("license-input").should("exist");
        });
    });

    it("should not show license input for cloud-hosted instances", () => {
      setTokenFeatures("all");
      mockBillingTokenFeatures([
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
        HOSTING_FEATURE_KEY,
      ]);
      cy.visit("/admin/settings/license");
      cy.findByTestId("license-input").should("not.exist");
    });

    it("should render an error if something fails when fetching billing info", () => {
      setTokenFeatures("all");
      mockBillingTokenFeatures([
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
      ]);
      // force an error
      cy.intercept("GET", "/api/ee/billing", req => {
        req.reply({ statusCode: 500 });
      });
      cy.visit("/admin/settings/license");
      cy.findByTestId("license-and-billing-content")
        .findByText(/An error occurred/)
        .should("exist");
    });
  });
});

describe("scenarios > admin > localization", () => {
  function setFirstWeekDayTo(day) {
    cy.request("PUT", "/api/setting/start-of-week", {
      value: day.toLowerCase(),
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setFirstWeekDayTo("monday");
  });

  it("should correctly apply start of the week to a bar chart (metabase#13516)", () => {
    // programatically create and save a question based on Orders table
    // filter: created before June 1st, 2022
    // summarize: Count by CreatedAt: Week

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.createQuestion({
      name: "Orders created before June 1st 2022",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        filter: ["<", ["field", ORDERS.CREATED_AT, null], "2022-06-01"],
      },
      display: "line",
    });

    // find and open that question
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders created before June 1st 2022").click();

    cy.wait("@cardQuery");

    cy.log("Assert the dates on the X axis");
    // it's hard and tricky to invoke hover in Cypress, especially in our graphs
    // that's why we have to assert on the x-axis, instead of a popover that shows on a dot hover
    echartsContainer().get("text").contains("April 25, 2022");
  });

  it("should display days on X-axis correctly when grouped by 'Day of the Week' (metabase#13604)", () => {
    cy.createQuestion({
      name: "13604",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "day-of-week" }],
        ],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, null],
          "2026-03-02", // Monday
          "2026-03-03", // Tuesday
        ],
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "graph.x_axis.scale": "ordinal",
      },
    });

    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("13604").click();

    cy.log("Reported failing on v0.37.0.2 and labeled as `.Regression`");
    echartsContainer()
      .get("text")
      .contains(/sunday/i)
      .should("not.exist");
    echartsContainer()
      .get("text")
      .contains(/monday/i);
    echartsContainer()
      .get("text")
      .contains(/tuesday/i);
  });

  // HANDLE WITH CARE!
  // This test is extremely tricky and fragile because it needs to test for the "past X weeks" to check if week starts on Sunday or Monday.
  // As the time goes by we're risking that past X weeks don't yield any result when applied to the sample database.
  // For that reason I've chosen the past 220 weeks (mid-October 2022). This should give us 3+ years to run this test without updates.

  // TODO:
  //  - Keep an eye on this test in CI and update the week range as needed.
  it("should respect start of the week in SQL questions with filters (metabase#14294)", () => {
    cy.createNativeQuestion(
      {
        name: "14294",
        native: {
          query:
            "select ID, CREATED_AT, dayname(CREATED_AT) as CREATED_AT_DAY\nfrom ORDERS \n[[where {{date_range}}]]\norder by CREATED_AT",
          "template-tags": {
            date_range: {
              id: "93961154-c3d5-7c93-7b59-f4e494fda499",
              name: "date_range",
              "display-name": "Date range",
              type: "dimension",
              dimension: ["field", ORDERS.CREATED_AT, null],
              "widget-type": "date/all-options",
              default: "past220weeks",
              required: true,
            },
          },
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("TableInteractive-root").as("resultTable");

    cy.get("@resultTable").within(() => {
      // The third cell in the first row (CREATED_AT_DAY)
      cy.get("[data-testid=cell-data]").eq(2).should("not.contain", "Sunday");
    });
  });

  it("should not display excessive options in localization tab (metabase#14426)", () => {
    cy.visit("/admin/settings/localization");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Instance language/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Report timezone/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/First day of the week/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Localization options/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/Column title/i).should("not.exist");
  });

  it("should use currency settings for number columns with style set to currency (metabase#10787)", () => {
    cy.visit("/admin/settings/localization");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Unit of currency");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("US Dollar").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Euro").click();
    undoToast().findByText("Changes saved").should("be.visible");

    visitQuestionAdhoc({
      display: "scalar",
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT 10 as A",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        column_settings: {
          '["name","A"]': {
            number_style: "currency",
          },
        },
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("€10.00");
  });

  it("should use fix up clj unit testsdate and time styling settings in the date filter widget (metabase#9151, metabase#12472)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/setting/custom-formatting").as(
      "updateFormatting",
    );

    cy.visit("/admin/settings/localization");

    cy.findByTestId("custom-formatting-setting").within(() => {
      // update the date style setting to YYYY/MM/DD
      cy.findByText("January 31, 2018").click();
    });

    popover().findByText("2018/1/31").click();
    cy.wait("@updateFormatting");

    cy.findByTestId("custom-formatting-setting").within(() => {
      cy.findAllByTestId("select-button-content").should(
        "contain",
        "2018/1/31",
      );

      // update the time style setting to 24 hour
      cy.findByText("17:24 (24-hour clock)").click();
      cy.wait("@updateFormatting");
      cy.findByDisplayValue("HH:mm").should("be.checked");
    });

    visitQuestion(ORDERS_QUESTION_ID);

    // create a date filter and set it to the 'On' view to see a specific date
    tableHeaderClick("Created At");

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Specific dates…").click();
      cy.findByText("On").click();

      // ensure the date picker is ready
      cy.findByTextEnsureVisible("Add time");
      cy.findByTextEnsureVisible("Add filter");

      // update the date input in the widget
      cy.findByLabelText("Date").clear().type("2024/5/15").blur();

      // add a time to the date
      cy.findByText("Add time").click();
      cy.findByLabelText("Time").clear().type("19:56");

      // apply the date filter
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");

    cy.findByTestId("loading-indicator").should("not.exist");

    // verify that the correct row is displayed
    cy.findByTestId("TableInteractive-root").within(() => {
      cy.findByText("2024/5/15, 19:56");
      cy.findByText("127.52");
    });
  });
});

describe("scenarios > admin > settings > map settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to load and save a custom map", () => {
    cy.visit("/admin/settings/maps");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add a map").click();
    cy.findByPlaceholderText("e.g. United Kingdom, Brazil, Mars").type(
      "Test Map",
    );
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type(
      "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Load").click();
    cy.wait(2000).findAllByText("Select…").first().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("NAME").click();
    cy.findAllByText("Select…").last().click();
    cy.findAllByText("NAME").last().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add map").click();
    cy.wait(3000).findByText("NAME").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Test Map");
  });

  it("should be able to load a custom map even if a name has not been added yet (#14635)", () => {
    cy.intercept("GET", "/api/geojson*").as("load");
    cy.visit("/admin/settings/maps");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add a map").click();
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type(
      "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Load").click();
    cy.wait("@load").then(interception => {
      expect(interception.response.statusCode).to.eq(200);
    });
  });

  it("should show an informative error when adding an invalid URL", () => {
    cy.visit("/admin/settings/maps");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add a map").click();
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type("bad-url");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Load").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(
      "Invalid GeoJSON file location: must either start with http:// or https:// or be a relative path to a file on the classpath. " +
        "URLs referring to hosts that supply internal hosting metadata are prohibited.",
    );
  });

  it("should show an informative error when adding a valid URL that does not contain GeoJSON, or is missing required fields", () => {
    cy.visit("/admin/settings/maps");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add a map").click();

    // Not GeoJSON
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type("https://metabase.com");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Load").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("GeoJSON URL returned invalid content-type");

    // GeoJSON with an unsupported format (not a Feature or FeatureCollection)
    cy.findByPlaceholderText("Like https://my-mb-server.com/maps/my-map.json")
      .clear()
      .type(
        "https://raw.githubusercontent.com/metabase/metabase/master/test_resources/test.geojson",
      );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Load").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Invalid custom GeoJSON: does not contain features");
  });

  it("should show an informative error when adding a calid URL that contains GeoJSON that does not use lat/lng coordinates", () => {
    //intercept call to api/geojson and return projected.geojson. Call to load file actually happens in the BE
    cy.fixture("../../e2e/support/assets/projected.geojson").then(data => {
      cy.intercept("GET", "/api/geojson*", data);
    });

    cy.visit("/admin/settings/maps");
    cy.button("Add a map").click();

    modal().within(() => {
      // GeoJSON with an unsupported format (not a Feature or FeatureCollection)
      cy.findByPlaceholderText("Like https://my-mb-server.com/maps/my-map.json")
        .clear()
        .type("http://assets/projected.geojson");
      cy.findByText("Load").click();
      cy.findByText(
        "Invalid custom GeoJSON: coordinates are outside bounds for latitude and longitude",
      );
    });
  });
});

describe("admin > upload settings", () => {
  describe("scenarios > admin > uploads (OSS)", { tags: "@OSS" }, () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should show the uploads settings page", () => {
      cy.visit("/admin/settings/uploads");
      cy.findByTestId("admin-list-settings-items").findByText("Uploads");
      cy.findByLabelText("Upload Settings Form").findByText(
        "Database to use for uploads",
      );
    });
  });
  describeEE("scenarios > admin > uploads (EE)", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("without attached-dwh should show the uploads settings page", () => {
      mockSessionPropertiesTokenFeatures({ attached_dwh: false });
      cy.visit("/admin/settings/uploads");
      cy.findByTestId("admin-list-settings-items").findByText("Uploads");
      cy.findByLabelText("Upload Settings Form").findByText(
        "Database to use for uploads",
      );
    });

    it("with attached-dwh should not show the uploads settings page", () => {
      mockSessionPropertiesTokenFeatures({ attached_dwh: true });
      cy.visit("/admin/settings/uploads");
      cy.findByTestId("admin-list-settings-items")
        .findByText("Uploads")
        .should("not.exist");

      cy.findAllByLabelText("error page").findByText(
        "The page you asked for couldn't be found.",
      );
    });
  });
});
