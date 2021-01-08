import { restore, signInAsAdmin, USERS } from "__support__/cypress";
const { admin } = USERS;

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
    // Dummy SMTP setup
    cy.request("PUT", "/api/setting", {
      "email-smtp-host": "smtp.foo.test",
      "email-smtp-port": "587",
      "email-smtp-security": "none",
      "email-smtp-username": "nevermind",
      "email-smtp-password": "it-is-secret-NOT",
      "email-from-address": "nonexisting@metabase.test",
    });
  });

  it.skip("should persist attachments for dashboard subscriptions (metabase#14117)", () => {
    // Orders in a dashboard
    cy.visit("/dashboard/1");
    cy.get(".Icon-share").click();
    cy.findByText("Dashboard subscriptions").click();
    cy.findByText("Email it").click();
    cy.findByPlaceholderText("Enter user names or email addresses")
      .click()
      .type(`${admin.first_name} ${admin.last_name}{enter}`);
    // This is extremely fragile
    // TODO: update test once changes from `https://github.com/metabase/metabase/pull/14121` are merged into `master`
    cy.findByText("Attach results")
      .parent()
      .parent()
      .next()
      .find("a") // Toggle
      .click();
    cy.findByText("Questions to attach").click();
    cy.contains("Done")
      .closest(".Button")
      .should("not.be.disabled")
      .click();
    cy.findByText("Subscriptions");
    cy.findByText("Emailed daily at 8:00 AM").click();
    cy.findByText("Delete this subscription").scrollIntoView();
    cy.findByText("Questions to attach");
    cy.findAllByRole("listitem")
      .contains("Orders") // yields the whole <li> element
      .within(() => {
        cy.findByRole("checkbox").should("have.attr", "aria-checked", "true");
      });
  });
});
