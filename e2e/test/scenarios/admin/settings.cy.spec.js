const { H } = cy;
import { WEBMAIL_CONFIG } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS } = SAMPLE_DATABASE;
const { SMTP_PORT, WEB_PORT } = WEBMAIL_CONFIG;

describe("scenarios > admin > settings", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should apply saved field currency settings to query results", () => {
    cy.request("PUT", `/api/field/${ORDERS.TOTAL}`, {
      semantic_type: "type/Currency",
      settings: { currency_in_header: false },
    });

    H.openOrdersTable({ limit: 2 });

    H.tableInteractiveBody().within(() => {
      cy.findByText("$39.72");
      cy.findByText("$117.03");
    });
  });
});

describe("scenarios > admin > settings > email settings", () => {
  describe("self-hosted instance", () => {
    beforeEach(() => {
      cy.intercept("PUT", "api/email").as("smtpSaved");
      cy.intercept("DELETE", "api/email").as("smtpCleared");
      H.restore();
      cy.signInAsAdmin();
    });

    it("should be able to save and clear email settings", () => {
      cy.visit("/admin/settings/email");
      cy.findByTestId("self-hosted-smtp-connection-card")
        .button("Configure")
        .click();

      H.modal().within(() => {
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

      cy.findByLabelText("From Address")
        .clear()
        .type("mailer@metabase.test")
        .blur();

      cy.findByLabelText("From Name").type("Sender Name").blur();
      cy.findByLabelText("Reply-To Address")
        .type("reply-to@metabase.test")
        .blur();

      cy.reload();

      cy.findByDisplayValue("mailer@metabase.test");
      cy.findByDisplayValue("Sender Name");
      cy.findByDisplayValue("reply-to@metabase.test");

      cy.findByTestId("self-hosted-smtp-connection-card")
        .findByText("Edit configuration")
        .click();
      H.modal().within(() => {
        cy.findByDisplayValue("localhost");
        cy.findByDisplayValue(SMTP_PORT);
        cy.findAllByDisplayValue("admin");
        cy.button("Clear").click();
      });
      cy.wait("@smtpCleared");

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
    });

    it("should be able to save and clear email settings", () => {
      cy.visit("/admin/settings/email");
      cy.findByTestId("cloud-smtp-connection-card")
        .button("Set up a custom SMTP server")
        .click();

      H.modal().within(() => {
        cy.findByLabelText(/SMTP Host/i)
          .type("localhost")
          .blur();
        cy.findByText(/465/i).click();
        cy.findByText(/SSL/i).click();
        cy.findByLabelText(/SMTP Username/i)
          .type("admin")
          .blur();
        cy.findByLabelText(/SMTP Password/i)
          .type("admin")
          .blur();
        cy.button("Save changes").click();
      });

      cy.wait("@smtpSaved");

      cy.findByLabelText("From Address")
        .clear()
        .type("mailer@metabase.test")
        .blur();

      cy.findByLabelText("From Name").type("Sender Name").blur();
      cy.findByLabelText("Reply-To Address")
        .type("reply-to@metabase.test")
        .blur();

      cy.reload();

      cy.findByDisplayValue("mailer@metabase.test");
      cy.findByDisplayValue("Sender Name");
      cy.findByDisplayValue("reply-to@metabase.test");

      cy.findByTestId("cloud-smtp-connection-card").within(() => {
        cy.findByLabelText("Custom SMTP Server").should("be.checked");
        cy.button("Edit settings").click();
      });
      H.modal().within(() => {
        cy.findByDisplayValue("localhost");
        cy.findAllByDisplayValue("admin");
        cy.button("Clear").click();
        cy.wait("@smtpCleared");
        cy.findByRole("button", { name: "Close" }).click();
      });

      cy.reload();
      cy.findByTestId("cloud-smtp-connection-card")
        .button("Set up a custom SMTP server")
        .should("be.visible");
    });
  });
});

describe("scenarios > admin > localization", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should apply date and time style settings to table cells (metabase#11394)", () => {
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

    cy.findByTestId("custom-formatting-setting")
      .findByText("17:24 (24-hour clock)")
      .click();
    cy.wait("@updateFormatting");

    H.openOrdersTable({ limit: 2 });

    cy.findByTextEnsureVisible("Created At");
    cy.findAllByTestId("cell-data").should("contain", "2028/2/11, 21:40");
  });
});
