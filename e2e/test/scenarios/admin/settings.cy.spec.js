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
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
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
