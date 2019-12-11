import path from "path";
import { plainDbHost } from "__support__/cypress";

describe("setup wizard", () => {
  before(() => {
    Cypress.config("baseUrl", plainDbHost);
  });

  it("should allow you to sign up", () => {
    // intial redirection and welcome page
    cy.visit("/");
    cy.url().should("be", "/setup");
    cy.contains("Welcome to Metabase");
    cy.contains("Let's get started").click();

    // ====
    // User
    // ====

    // "Next" should be disabled on the blank form
    cy.contains("Next").should("be.disabled");

    cy.get('input[name="first_name"]').type("Testy");
    cy.get('input[name="last_name"]').type("McTestface");
    cy.get('input[name="email"]').type("testy@metabase.com");
    cy.get('input[name="site_name"]').type("Epic Team");

    // test first with a weak password
    cy.get('input[name="password"]').type("password");
    cy.get('input[name="password_confirm"]').type("password");

    // the form shouldn't be valid yet and we should display an error
    cy.contains("Insufficient password strength");
    cy.contains("Next").should("be.disabled");

    // now try a strong password that doesn't match
    const strongPassword = "QJbHYJN3tPW[";
    cy.get('input[name="password"]')
      .clear()
      .type(strongPassword);
    cy.get('input[name="password_confirm"]')
      .clear()
      .type(strongPassword + "foobar");

    // tell the user about the mismatch after clicking "Next"
    cy.contains("Next")
      .should("not.be.disabled")
      .click();
    cy.contains("Passwords do not match");

    // fix that mismatch
    cy.get('input[name="password_confirm"]')
      .clear()
      .type(strongPassword);

    // Submit the first section
    cy.contains("Next").click();

    // ========
    // Database
    // ========

    // The database step should be open
    cy.contains("You’ll need some info about your database");

    // test that you can return to user settings if you want
    cy.contains("Hi, Testy. nice to meet you!").click();
    cy.get('input[name="email"]').should("have.value", "testy@metabase.com");

    // now back to database setting
    cy.contains("Next").click();

    // add h2 database
    cy.get("select").select("H2");
    cy.get("input[name='name']").type("Metabase H2");
    cy.contains("Next").should("be.disabled");

    const dbPath = path.resolve(
      Cypress.config("fileServerFolder"),
      "frontend/test/__runner__/empty.db",
    );
    cy.get("input[name='db']").type(`file:${dbPath}`);
    cy.contains("Next")
      .should("not.be.disabled")
      .click();

    // return to db settings and turn on manual scheduling
    cy.contains("Connecting to Metabase H2").click();
    cy.contains("let me choose when Metabase syncs")
      .parents(".Form-field")
      .find("a")
      .click();
    cy.contains("Next").click();

    // now, we should see the sync scheduling form
    cy.contains("When should Metabase automatically scan");
    cy.contains("Never, I'll do this manually if I need to").click();
    cy.contains("Next").click();

    // ================
    // Data Preferences
    // ================

    // collection defaults to on and describes data collection
    cy.contains("All collection is completely anonymous.");
    // turn collection off, which hides data collection description
    cy.contains("Allow Metabase to anonymously collect usage events")
      .parents(".Form-field")
      .find("a")
      .click();
    cy.contains("All collection is completely anonymous.").should("not.exist");
    cy.contains("Next").click();

    // ==================
    // Finish & Subscribe
    // ==================
    cy.contains("You're all set up!");
    cy.contains(
      "Get infrequent emails about new releases and feature updates.",
    );
    cy.contains("Take me to Metabase").click();
    cy.url().should("be", "/");
  });
});
