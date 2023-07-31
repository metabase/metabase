import { main, restore, setupSMTP } from "e2e/support/helpers";
import { WEBMAIL_CONFIG } from "e2e/support/cypress_data";

const { SMTP_PORT, WEB_PORT } = WEBMAIL_CONFIG;

describe("scenarios > admin > settings > email settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to save email settings (metabase#17615)", () => {
    cy.visit("/admin/settings/email");
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
    main().within(() => {
      cy.findByText("Changes saved!");
    });

    // Non SMTP-settings should save automatically
    cy.findByLabelText("From Address").type("mailer@metabase.test").blur();
    cy.findByLabelText("From Name").type("Sender Name").blur();
    cy.findByLabelText("Reply-To Address")
      .type("reply-to@metabase.test")
      .blur();

    // Refresh page to confirm changes persist
    cy.reload();

    // This part was added as a repro for metabase#17615
    cy.findByDisplayValue("localhost");
    cy.findByDisplayValue(SMTP_PORT);
    cy.findAllByDisplayValue("admin");
    cy.findByDisplayValue("mailer@metabase.test");
    cy.findByDisplayValue("Sender Name");
    cy.findByDisplayValue("reply-to@metabase.test");
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
    cy.visit("/admin/settings/email");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Send test email").click();
    cy.findAllByText("Wrong host or port").should("have.length", 2);
  });

  it(
    "should send a test email for a valid SMTP configuration",
    { tags: "@external" },
    () => {
      setupSMTP();

      cy.visit("/admin/settings/email");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Send test email").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sent!");

      cy.request("GET", `http://localhost:${WEB_PORT}/email`).then(
        ({ body }) => {
          const emailBody = body[0].text;
          expect(emailBody).to.include("Your Metabase emails are working");
        },
      );
    },
  );

  it("should be able to clear email settings", () => {
    cy.visit("/admin/settings/email");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Clear").click();
    cy.findByLabelText("SMTP Host").should("have.value", "");
    cy.findByLabelText("SMTP Port").should("have.value", "");
    cy.findByLabelText("From Name").should("have.value", "");
    cy.findByLabelText("From Address").should("have.value", "");
    cy.findByLabelText("Reply-To Address").should("have.value", "");
  });

  it(
    "should not offer to save email changes when there aren't any (metabase#14749)",
    { tags: "@external" },
    () => {
      // Make sure some settings are already there
      setupSMTP();

      cy.visit("/admin/settings/email");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Send test email").scrollIntoView();
      // Needed to scroll the page down first to be able to use findByRole() - it fails otherwise
      cy.button("Save changes").should("be.disabled");
    },
  );

  it("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
    cy.intercept("PUT", "/api/email").as("updateSettings");

    cy.visit("/admin/settings/email");

    // First we fill out wrong settings
    cy.findByLabelText("SMTP Host")
      .type("foo") // Invalid SMTP host
      .blur();
    cy.findByLabelText("SMTP Port").type(SMTP_PORT).blur();
    cy.findByLabelText("SMTP Username").type("admin").blur();
    cy.findByLabelText("SMTP Password").type("admin").blur();
    cy.findByLabelText("From Address").type("mailer@metabase.test").blur();

    // Trying to save will trigger the error (as it should)
    cy.button("Save changes").click();

    cy.wait("@updateSettings");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Wrong host or port");

    // But it shouldn't delete field values
    cy.findByDisplayValue("mailer@metabase.test");
  });
});
