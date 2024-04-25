import { WEBMAIL_CONFIG } from "e2e/support/cypress_data";
import { main, restore, setupSMTP } from "e2e/support/helpers";

const { SMTP_PORT, WEB_PORT } = WEBMAIL_CONFIG;

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
