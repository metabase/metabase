import { signInAsAdmin, restore, openOrdersTable } from "__support__/cypress";

describe("scenarios > admin > settings", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should save a setting", () => {
    cy.server();
    cy.route("PUT", "**/admin-email").as("saveSettings");

    cy.visit("/admin/settings/general");

    // aliases don't last past refreshes, so create a function to grab the input
    // rather than aliasing it with .as()
    const emailInput = () =>
      cy
        .contains("Email Address for Help Requests")
        .parent()
        .parent()
        .find("input");

    emailInput()
      .clear()
      .type("other.email@metabase.com")
      .blur();
    cy.wait("@saveSettings");

    cy.visit("/admin/settings/general");
    // after we refreshed, the field should still be "other.email"
    emailInput().should("have.value", "other.email@metabase.com");

    // reset the email
    emailInput()
      .clear()
      .type("bob@metabase.com")
      .blur();
    cy.wait("@saveSettings");
  });

  it("should update the formatting", () => {
    cy.server();
    cy.route("PUT", "**/custom-formatting").as("saveFormatting");

    // update the formatting
    cy.visit("/admin/settings/formatting");
    cy.contains("17:24 (24-hour clock)").click();
    cy.wait("@saveFormatting");

    // check the new formatting in a question
    openOrdersTable();
    cy.contains(/^February 11, 2019, 21:40$/).debug();

    // reset the formatting
    cy.visit("/admin/settings/formatting");
    cy.contains("5:24 PM (12-hour clock)").click();
    cy.wait("@saveFormatting");

    // check the reset formatting in a question
    openOrdersTable();
    cy.contains(/^February 11, 2019, 9:40 PM$/);
  });

  describe(" > email settings", () => {
    it("should be able to save email settings", () => {
      cy.visit("/admin/settings/email");
      cy.findByPlaceholderText("smtp.yourservice.com")
        .type("localhost")
        .blur();
      cy.findByPlaceholderText("587")
        .type("1234")
        .blur();
      cy.findByPlaceholderText("metabase@yourcompany.com")
        .type("admin@metabase.com")
        .blur();
      cy.findByText("Save changes").click();

      cy.findByText("Changes saved!");
    });
    it("should show an error if test email fails", () => {
      cy.visit("/admin/settings/email");
      cy.findByText("Send test email").click();
      cy.findByText("Sorry, something went wrong. Please try again.");
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
  });
});
