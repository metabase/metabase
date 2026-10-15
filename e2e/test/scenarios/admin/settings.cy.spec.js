const { H } = cy;
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WEBMAIL_CONFIG,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { SMTP_PORT, WEB_PORT } = WEBMAIL_CONFIG;

describe("scenarios > admin > settings", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show where to display the unit of currency (metabase#table-metadata-missing-38021 and update the formatting", () => {
    // Set the semantic type of total to currency
    cy.request("PUT", `/api/field/${ORDERS.TOTAL}`, {
      semantic_type: "type/Currency",
    });

    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.TOTAL,
    });

    H.DataModel.FieldSection.get().within(() => {
      // Assert that this option now exists
      cy.findByText("Where to display the unit of currency")
        .scrollIntoView()
        .should("be.visible");
      cy.findByText("In every table cell").click();
    });

    // Open the orders table
    H.openOrdersTable({ limit: 2 });

    H.tableInteractiveBody().within(() => {
      // Items in the total column should have a leading dollar sign
      cy.findByText("$39.72");
      cy.findByText("$117.03");
    });
  });
});

describe("scenarios > admin > settings > email settings", () => {
  describe("self-hosted instance", () => {
    beforeEach(() => {
      cy.intercept("PUT", "api/email").as("smtpSaved");
      H.restore();
      cy.signInAsAdmin();
      H.resetSnowplow();
      H.enableTracking();
    });

    it("should be able to save and clear email settings", () => {
      cy.visit("/admin/settings/email");
      cy.findByTestId("cloud-smtp-connection-card").should("not.exist");
      cy.findByTestId("self-hosted-smtp-connection-card")
        .button("Configure")
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: "custom_smtp_setup_clicked",
        event_detail: "self-hosted",
      });

      H.modal().within(() => {
        // SMTP connection setup
        cy.findByLabelText(/SMTP Host/i)
          .type("localhost")
          .blur();
        cy.findByLabelText(/SMTP Port/i)
          .type(SMTP_PORT)
          .blur();
        cy.findByLabelText(/SMTP Username/i)
          .type("admin")
          .blur();
        cy.findByLabelText(/SMTP Password/i)
          .type("admin")
          .blur();
        cy.button("Save changes").click();
      });

      cy.wait("@smtpSaved");

      H.expectUnstructuredSnowplowEvent({
        event: "custom_smtp_setup_success",
        event_detail: "self-hosted",
      });

      // should show as active now
      cy.findByTestId("self-hosted-smtp-connection-card")
        .findByText("Active")
        .should("be.visible");

      // button should be different
      cy.findByTestId("self-hosted-smtp-connection-card")
        .button("Edit configuration")
        .should("be.visible");

      // Non SMTP-settings should save automatically
      cy.findByLabelText("From Address")
        .clear()
        .type("mailer@metabase.test")
        .blur();

      cy.findByLabelText("From Name").type("Sender Name").blur();
      cy.findByLabelText("Reply-To Address")
        .type("reply-to@metabase.test")
        .blur();

      // Refresh page to confirm changes persist
      cy.reload();

      // validate additional settings
      cy.findByDisplayValue("mailer@metabase.test");
      cy.findByDisplayValue("Sender Name");
      cy.findByDisplayValue("reply-to@metabase.test");

      // validate SMTP connection settings
      cy.findByTestId("self-hosted-smtp-connection-card")
        .findByText("Edit configuration")
        .click();
      cy.findByDisplayValue("localhost");
      cy.findByDisplayValue(SMTP_PORT);
      cy.findAllByDisplayValue("admin");

      // should not offer to save email changes when there aren't any (metabase#14749)
      cy.button("Save changes").should("be.disabled");

      // should be able to clear email settings
      H.modal().button("Clear").click();

      cy.reload();

      cy.findByTestId("self-hosted-smtp-connection-card")
        .findByText("Configure")
        .click();

      H.modal().within(() => {
        cy.findByLabelText("SMTP Host").should("have.value", "");
        cy.findByLabelText("SMTP Port").should("have.value", "");
        cy.findByLabelText("SMTP Username").should("have.value", "");
        cy.findByLabelText("SMTP Password").should("have.value", "");
      });

      H.expectNoBadSnowplowEvents();
    });

    it(
      "should show an error if test email fails and send a test email for a valid SMTP configuration",
      { tags: "@external" },
      () => {
        cy.log("should show an error if test email fails");
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
        cy.visit("/admin/settings/email");

        cy.findByTestId("admin-layout-content").within(() => {
          cy.button("Send test email").click();
          cy.findByText(
            "Couldn't connect to host, port: localhost, 1234; timeout -1",
          );
        });

        cy.log("should send a test email for a valid SMTP configuration");
        H.setupSMTP();
        // The visit also clears the error toast above, so "Email sent!" is the only toast
        cy.visit("/admin/settings/email");
        cy.findByTestId("admin-layout-content")
          .button("Send test email")
          .click();
        H.undoToast().findByText("Email sent!").should("be.visible");
        cy.request("GET", `http://localhost:${WEB_PORT}/email`).then(
          ({ body }) => {
            const emailBody = body[0].text;
            expect(emailBody).to.include("Your Metabase emails are working");
          },
        );
      },
    );
  });

  describe("Pro-cloud instance", () => {
    beforeEach(() => {
      cy.intercept("DELETE", "api/ee/email/override").as("smtpCleared");
      cy.intercept("PUT", "api/ee/email/override").as("smtpSaved");
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-cloud");
      // A real pro-cloud instance configures email via env vars; set the SMTP host so
      // email-configured? is true (avoids a session/properties intercept that flakes on reload).
      H.updateSetting("email-smtp-host", "smtp.example.test");
      H.resetSnowplow();
      H.enableTracking();
    });

    it("should be able to save and clear email settings", () => {
      cy.visit("/admin/settings/email");
      cy.findByTestId("self-hosted-smtp-connection-card").should("not.exist");
      cy.findByTestId("cloud-smtp-connection-card")
        .button("Set up a custom SMTP server")
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: "custom_smtp_setup_clicked",
        event_detail: "cloud",
      });

      H.modal().within(() => {
        cy.findByLabelText(/SMTP Host/i)
          .type("localhost")
          .blur();
        cy.findByText(/465/i).click();
        cy.findByText(/SSL/i).click();
        cy.findByDisplayValue(/465/i).should("have.attr", "checked");
        cy.findByDisplayValue(/SSL/i).should("have.attr", "checked");
        cy.findByLabelText(/SMTP Username/i)
          .type("admin")
          .blur();
        cy.findByLabelText(/SMTP Password/i)
          .type("admin")
          .blur();
        cy.button("Save changes").click();
      });

      cy.wait("@smtpSaved");

      H.expectUnstructuredSnowplowEvent({
        event: "custom_smtp_setup_success",
        event_detail: "cloud",
      });

      cy.findByTestId("cloud-smtp-connection-card").within(() => {
        // Button text should change
        cy.button("Edit settings");
        // Custom server should be auto-enabled
        cy.findByLabelText("Custom SMTP Server").should("be.checked");
      });

      cy.findByLabelText("From Address")
        .clear()
        .type("mailer@metabase.test")
        .blur();

      cy.findByLabelText("From Name").type("Sender Name").blur();
      cy.findByLabelText("Reply-To Address")
        .type("reply-to@metabase.test")
        .blur();

      // Refresh page to confirm changes persist
      cy.reload();

      // validate additional settings
      cy.findByDisplayValue("mailer@metabase.test");
      cy.findByDisplayValue("Sender Name");
      cy.findByDisplayValue("reply-to@metabase.test");

      // validate SMTP connection settings
      cy.findByTestId("cloud-smtp-connection-card")
        .findByText("Edit settings")
        .click();
      H.modal().within(() => {
        cy.findByDisplayValue("localhost");
        cy.findAllByDisplayValue("admin");
        cy.button("Save changes").should("be.disabled");

        cy.button("Clear").click();
        cy.wait("@smtpCleared");
        cy.findByLabelText("SMTP Host").should("have.value", "");
        cy.findByDisplayValue(/465/i).should("have.attr", "checked");
        cy.findByDisplayValue(/SSL/i).should("have.attr", "checked");
        cy.findByLabelText("SMTP Username").should("have.value", "");
        cy.findByLabelText("SMTP Password").should("have.value", "");
        cy.findByRole("button", { name: "Close" }).click();
      });

      // Button text should revert back
      cy.findByTestId("cloud-smtp-connection-card").findByText(
        "Set up a custom SMTP server",
      );

      H.expectNoBadSnowplowEvents();
    });
  });
});

describe("scenarios > admin > localization", () => {
  function setFirstWeekDayTo(day) {
    H.updateSetting("start-of-week", day.toLowerCase());
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    setFirstWeekDayTo("monday");
  });

  it("should correctly apply start of the week to a bar chart (metabase#13516)", () => {
    // programatically create and save a question based on Orders table
    // filter: created before June 1st, 2025
    // summarize: Count by CreatedAt: Week
    H.createQuestion(
      {
        name: "Orders created before June 1st 2025",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
          filter: ["<", ["field", ORDERS.CREATED_AT, null], "2025-06-01"],
        },
        display: "bar",
      },
      { visitQuestion: true },
    );

    cy.log("Assert the dates on the X axis");
    // it's hard and tricky to invoke hover in Cypress, especially in our graphs
    // that's why we have to assert on the x-axis, instead of a popover that shows on a dot hover
    // April 28 is Monday in year 2025. Expect this to break when we shift years in the Sample Database.
    H.echartsContainer().find("text").should("contain", "April 28, 2025");
  });

  it("should use currency settings for number columns with style set to currency (metabase#10787) and search for and select a new timezone", () => {
    cy.intercept("PUT", "**/report-timezone").as("reportTimezone");
    cy.visit("/admin/settings/localization");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Unit of currency");
    cy.findByDisplayValue("US Dollar").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Euro").click();
    H.undoToast().findByText("Changes saved").should("be.visible");

    // Runs after the currency toast assertion because saving the timezone shows another toast
    cy.log("should search for and select a new timezone");
    cy.findByRole("textbox", { name: /timezone/i })
      .as("timezoneSelect")
      .clear()
      .type("Centr");
    H.selectDropdown().findByText("US/Central").click();
    cy.wait("@reportTimezone");
    cy.get("@timezoneSelect").should("have.value", "US/Central");

    cy.log(
      "should use currency settings for number columns with style set to currency (metabase#10787)",
    );
    H.visitQuestionAdhoc({
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("€10.00");
  });

  it("should apply date and time style settings to table cells and the date filter widget (metabase#11394, metabase#9151, metabase#12472)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/setting/custom-formatting").as(
      "updateFormatting",
    );

    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    cy.visit("/admin/settings/localization");

    cy.findByTestId("custom-formatting-setting").within(() => {
      // update the date style setting to YYYY/MM/DD
      cy.findByDisplayValue("January 31, 2018").click();
    });

    H.popover().findByText("2018/1/31").click();
    cy.wait("@updateFormatting");

    cy.findByTestId("custom-formatting-setting").within(() => {
      cy.findByTestId("date_style-formatting-setting").findByDisplayValue(
        "2018/1/31",
      );
      // update the time style setting to 24 hour
      cy.findByText("17:24 (24-hour clock)").click();
      cy.wait("@updateFormatting");
      cy.findByDisplayValue("HH:mm").should("be.checked");
    });

    cy.log(
      "Globalized date formats are applied to table cells (metabase#11394)",
    );
    H.openOrdersTable({ limit: 2 });

    cy.findByTextEnsureVisible("Created At");
    cy.findAllByTestId("cell-data")
      .should("contain", "Created At")
      .and("contain", "2028/2/11, 21:40");

    cy.log(
      "Date and time styles are applied in the date filter widget (metabase#9151, metabase#12472)",
    );
    H.visitQuestion(ORDERS_QUESTION_ID);

    // create a date filter and set it to the 'On' view to see a specific date
    H.tableHeaderClick("Created At");

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Fixed date range…").click();
      cy.findByText("On").click();

      // ensure the date picker is ready
      cy.findByTextEnsureVisible("Add time");
      cy.findByTextEnsureVisible("Add filter");

      // update the date input in the widget
      cy.findByLabelText("Date").clear().type("2027/5/15").blur();

      // add a time to the date
      cy.findByText("Add time").click();
      cy.findByLabelText("Time").clear().type("19:56");

      // apply the date filter
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");

    cy.findByTestId("loading-indicator").should("not.exist");

    // verify that the correct row is displayed
    H.tableInteractive().within(() => {
      cy.findByText("2027/5/15, 19:56");
      cy.findByText("127.52");
    });

    cy.log("Switching back to the 12-hour clock updates the formatting");
    cy.visit("/admin/settings/localization");

    cy.findByTestId("custom-formatting-setting").within(() => {
      cy.findByText("5:24 PM (12-hour clock)").click();
      cy.wait("@updateFormatting");
      cy.findByDisplayValue("h:mm A").should("be.checked");
    });

    H.openOrdersTable({ limit: 2 });

    cy.findByTextEnsureVisible("Created At");
    cy.findAllByTestId("cell-data").should("contain", "2028/2/11, 9:40 PM");
  });
});

describe("scenarios > admin > settings > map settings", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("GET", "/api/geojson*").as("getGeoJson");
    cy.signInAsAdmin();
  });

  it("should be able to load a custom map before a name is added, then save it (#14635)", () => {
    cy.visit("/admin/settings/maps");
    cy.button("Add a map").click();
    cy.findByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    ).type(
      "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json",
    );
    cy.log("Loading works before a map name is entered (#14635)");
    cy.button("Load").click();
    cy.wait("@getGeoJson").then((interception) => {
      expect(interception.response.statusCode).to.eq(200);
    });

    cy.findByPlaceholderText("e.g. United Kingdom, Brazil, Mars").type(
      "Test Map",
    );
    cy.findByTestId("map-region-key-select").click();
    H.selectDropdown().contains("NAME").click();
    cy.findByTestId("map-region-name-select").click();
    H.selectDropdown().contains("NAME").click();
    cy.button("Add map").click();
    cy.findByTestId("admin-layout-content").within(() => {
      cy.contains("NAME").should("not.exist");
      cy.contains("Test Map");
    });
  });
});

// Ensure the webhook tester docker container is running
// docker run -p 127.0.0.1:9080:8080/tcp tarampampam/webhook-tester:1.1.0 serve --create-session 00000000-0000-0000-0000-000000000000
describe("notifications", { tags: "@external" }, () => {
  beforeEach(() => {
    H.resetWebhookTester();
    H.restore();
    cy.signInAsAdmin();
    cy.request({
      failOnStatusCode: false,
      url: `${H.WEBHOOK_TEST_HOST}/api/session/${H.WEBHOOK_TEST_SESSION_ID}/requests`,
      method: "DELETE",
    }).then((response) => {
      cy.log("Deleted requests.");
    });
  });

  describe("Auth", () => {
    const COMMON_FIELDS = [
      {
        label: "Webhook URL",
        value: H.WEBHOOK_TEST_URL,
      },
      {
        label: "Give it a name",
        value: "Awesome Hook",
      },
      {
        label: "Description",
        value: "The best hook ever",
      },
    ];

    // 3 Auth methods that add to the request. Unfortunately the webhook tester docker image doesn't support
    // query params at the moment. https://github.com/tarampampam/webhook-tester/issues/389
    const AUTH_METHODS = [
      {
        display: "Basic",
        name: "Basic",
        populateFields: () => {
          cy.findByLabelText("Username").type("test@metabase.com");
          cy.findByLabelText("Password").type("password");
        },
        validate: () => {
          cy.findByText("Authorization").should("exist");
          cy.findByText("Basic dGVzdEBtZXRhYmFzZS5jb206cGFzc3dvcmQ=").should(
            "exist",
          );
        },
      },
      {
        display: "Bearer",
        name: "Bearer",
        populateFields: () => {
          cy.findByLabelText("Bearer token").type("my-secret-token");
        },
        validate: () => {
          cy.findByText("Authorization").should("exist");
          cy.findByText("Bearer my-secret-token").should("exist");
        },
      },
      {
        display: "API Key - Header",
        name: "API Key",
        populateFields: () => {
          cy.findByLabelText("Key").type("Mb_foo");
          cy.findByLabelText("Value").type("mb-bar");
        },
        validate: () => {
          cy.findByText("Mb_foo").should("exist");
          cy.findByText("mb-bar").should("exist");
        },
      },
    ];

    AUTH_METHODS.forEach((auth) => {
      it(`${auth.display} Auth`, () => {
        cy.visit("/admin/settings/webhooks");
        cy.findByRole("heading", { name: "Add a webhook" }).click();

        H.modal().within(() => {
          COMMON_FIELDS.forEach((field) => {
            cy.findByLabelText(field.label).type(field.value);
          });

          cy.findByRole("radio", { name: auth.name }).click({ force: true });

          auth.populateFields();

          cy.button("Send a test").click();

          cy.button("Success").should("exist");
          cy.button("Create destination").click();
        });

        cy.findByRole("heading", { name: "Awesome Hook" }).should("exist");

        cy.visit(H.WEBHOOK_TEST_DASHBOARD);
        cy.findByRole("heading", { name: /Requests 1/ }).should("exist");

        auth.validate();
      });
    });
  });

  it("Should allow you to create and edit Notifications", () => {
    cy.visit("/admin/settings/webhooks");

    cy.findByRole("heading", { name: "Add a webhook" }).click();

    H.modal().within(() => {
      cy.findByRole("heading", { name: "New webhook destination" }).should(
        "exist",
      );

      cy.findByLabelText("Give it a name").type("Awesome Hook");
      cy.findByLabelText("Description").type("The best hook ever");

      cy.log("should show error responses when testing");

      cy.findByLabelText("Webhook URL").clear().type(H.WEBHOOK_TEST_HOST);
      cy.button("Send a test").click();
      cy.findByText("Test response").should("exist");
      cy.findByTestId("notification-test-response").should(
        "contain.text",
        "request-status",
      );
      cy.findByTestId("notification-test-response").should(
        "contain.text",
        "request-body",
      );

      cy.findByLabelText("Webhook URL").clear().type(H.WEBHOOK_TEST_URL);
      cy.button("Send a test").click();
      cy.findByText("Test response").should("not.exist");

      cy.button("Create destination").click();
    });

    cy.findByRole("button", { name: /Add another/ }).should("exist");

    cy.findByRole("heading", { name: "Awesome Hook" }).click();

    H.modal().within(() => {
      cy.findByRole("heading", { name: "Edit this webhook" }).should("exist");
      cy.findByLabelText("Give it a name").clear().type("Updated Hook");
      cy.button("Save changes").click();
    });

    cy.findByRole("heading", { name: "Updated Hook" }).click();

    H.modal()
      .button(/Delete this destination/)
      .click();

    cy.findByRole("heading", { name: "Add a webhook" }).should("exist");
  });
});
