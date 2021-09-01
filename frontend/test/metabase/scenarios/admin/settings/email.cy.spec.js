import { restore, setupDummySMTP } from "__support__/e2e/cypress";

describe("scenarios > admin > settings > email settings", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  it("should be able to save email settings", () => {
    cy.visit("/admin/settings/email");
    cy.findByPlaceholderText("smtp.yourservice.com")
      .type("localhost")
      .blur();
    cy.findByPlaceholderText("587")
      .type("25")
      .blur();
    cy.findByPlaceholderText("youlooknicetoday")
      .type("admin")
      .blur();
    cy.findByPlaceholderText("Shhh...")
      .type("admin")
      .blur();
    cy.findByPlaceholderText("metabase@yourcompany.com")
      .type("mailer@metabase.test")
      .blur();
    cy.findByText("Save changes").click();

    cy.findByText("Changes saved!");
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
    cy.findByText("Sorry, something went wrong. Please try again.");
  });

  it("should send a test email for a valid SMTP configuration", () => {
    // We must clear maildev inbox before each run - this will be extracted and automated
    cy.request("DELETE", "http://localhost:80/email/all");
    cy.request("PUT", "/api/setting", {
      "email-smtp-host": "localhost",
      "email-smtp-port": "25",
      "email-smtp-username": "admin",
      "email-smtp-password": "admin",
      "email-smtp-security": "none",
      "email-from-address": "mailer@metabase.test",
    });
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
    cy.findByPlaceholderText("smtp.yourservice.com").should("have.value", "");
    cy.findByPlaceholderText("587").should("have.value", "");
    cy.findByPlaceholderText("metabase@yourcompany.com").should(
      "have.value",
      "",
    );
  });

  it("should not offer to save email changes when there aren't any (metabase#14749)", () => {
    // Make sure some settings are already there
    setupDummySMTP();

    cy.visit("/admin/settings/email");
    cy.findByText("Send test email").scrollIntoView();
    // Needed to scroll the page down first to be able to use findByRole() - it fails otherwise
    cy.button("Save changes").should("be.disabled");
  });

  it.skip("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", () => {
    cy.visit("/admin/settings/email");

    // First we fill out wrong settings
    cy.findByPlaceholderText("smtp.yourservice.com")
      .type("foo") // Invalid SMTP host
      .blur();
    cy.findByPlaceholderText("587")
      .type("25")
      .blur();
    cy.findByPlaceholderText("youlooknicetoday")
      .type("admin")
      .blur();
    cy.findByPlaceholderText("Shhh...")
      .type("admin")
      .blur();
    cy.findByPlaceholderText("metabase@yourcompany.com")
      .type("mailer@metabase.test")
      .blur();

    // Trying to save will trigger the error (as it should)
    cy.button("Save changes").click();
    cy.findByText("Sorry, something went wrong. Please try again.");

    // But it shouldn't delete field values
    cy.findByDisplayValue("mailer@metabase.test");
  });
});
