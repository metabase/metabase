import { restore, setupSMTP } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > email settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to save email settings (metabase#17615)", () => {
    cy.visit("/admin/settings/email");
    cy.findByLabelText("SMTP Host").type("localhost").blur();
    cy.findByLabelText("SMTP Port").type("25").blur();
    cy.findByLabelText("SMTP Username").type("admin").blur();
    cy.findByLabelText("SMTP Password").type("admin").blur();
    cy.findByLabelText("From Address").type("mailer@metabase.test").blur();
    cy.findByText("Save changes").click();

    cy.findByText("Changes saved!", { timeout: 10000 });

    // This part was added as a repro for metabase#17615
    cy.findByDisplayValue("localhost");
    cy.findByDisplayValue("25");
    cy.findAllByDisplayValue("admin");
    cy.findByDisplayValue("mailer@metabase.test");
  });

  it("should show an error if test email fails", () => {
    // Reuse Email setup without relying on the previous test
    cy.request("PUT", "/api/setting", {
      "email-from-address": "admin@metabase.test",
      "email-smtp-host": "localhost",
      "email-smtp-password": null,
      "email-smtp-port": "1234",
      "email-smtp-security": "none",
      "email-smtp-username": null,
    });
    cy.visit("/admin/settings/email");
    cy.findByText("Send test email").click();
    cy.findAllByText("Wrong host or port").should("have.length", 2);
  });

  it("should send a test email for a valid SMTP configuration", () => {
    setupSMTP();

    cy.visit("/admin/settings/email");
    cy.findByText("Send test email").click();
    cy.findByText("Sent!");
    cy.request("GET", "http://localhost:80/email").then(({ body }) => {
      const emailBody = body[0].text;
      expect(emailBody).to.include("Your Metabase emails are working");
    });
  });

  it("should be able to clear email settings", () => {
    cy.visit("/admin/settings/email");
    cy.findByText("Clear").click();
    cy.findByLabelText("SMTP Host").should("have.value", "");
    cy.findByLabelText("SMTP Port").should("have.value", "");
    cy.findByLabelText("From Address").should("have.value", "");
  });

  it("should not offer to save email changes when there aren't any (metabase#14749)", () => {
    // Make sure some settings are already there
    setupSMTP();

    cy.visit("/admin/settings/email");
    cy.findByText("Send test email").scrollIntoView();
    // Needed to scroll the page down first to be able to use findByRole() - it fails otherwise
    cy.button("Save changes").should("be.disabled");
  });

  it("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
    cy.intercept("PUT", "/api/email").as("updateSettings");

    cy.visit("/admin/settings/email");

    // First we fill out wrong settings
    cy.findByLabelText("SMTP Host")
      .type("foo") // Invalid SMTP host
      .blur();
    cy.findByLabelText("SMTP Port").type("25").blur();
    cy.findByLabelText("SMTP Username").type("admin").blur();
    cy.findByLabelText("SMTP Password").type("admin").blur();
    cy.findByLabelText("From Address").type("mailer@metabase.test").blur();

    // Trying to save will trigger the error (as it should)
    cy.button("Save changes").click();

    cy.wait("@updateSettings");
    cy.contains("Wrong host or port");

    // But it shouldn't delete field values
    cy.findByDisplayValue("mailer@metabase.test");
  });
});
