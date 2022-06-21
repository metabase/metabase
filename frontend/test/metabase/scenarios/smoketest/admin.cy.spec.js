import { restore } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

const { admin } = USERS;

describe("metabase-smoketest > admin", () => {
  before(() => restore("blank"));

  describe("Admin can setup an account", () => {
    beforeEach(() => restore("blank"));

    it("should set up Metabase without first name and last name (metabase#22754)", () => {
      // This is a simplified version of the "scenarios > setup" test
      cy.visit("/");
      cy.findByText("Welcome to Metabase");
      cy.url().should("not.include", "login");
      cy.findByTextEnsureVisible("Let's get started").click();

      // Language

      cy.findByText("What's your preferred language?");
      cy.findByText("English").click();
      cy.findByText("Next").click();

      // User (with workaround from "scenarios > setup"  document)

      cy.findByText("What should we call you?");

      cy.findByLabelText("Email").type(admin.email);
      cy.findByLabelText("Company or team name").type("Epic Team");

      cy.findByLabelText("Create a password")
        .clear()
        .type(admin.password);
      cy.findByLabelText("Confirm your password")
        .clear()
        .type(admin.password);
      cy.findByText("Next").click();

      cy.findByText("Hi. Nice to meet you!");

      // Database

      cy.findByText("Add your data");
      cy.findByText("I'll add my data later");

      cy.findByText("Show more options").click();
      cy.findByText("H2").click();
      cy.findByLabelText("Display name").type("Metabase H2");

      const dbFilename = "frontend/test/__runner__/empty.db";
      const dbPath = Cypress.config("fileServerFolder") + "/" + dbFilename;
      cy.findByLabelText("Connection String").type(`file:${dbPath}`);
      cy.findByText("Connect database").click();

      // Turns off anonymous data collection
      cy.findByLabelText(
        "Allow Metabase to anonymously collect usage events",
      ).click();
      cy.findByText("All collection is completely anonymous.").should(
        "not.exist",
      );
      cy.findByText("Finish").click();

      // Finish & Subscribe

      cy.findByText("Take me to Metabase").click();
      cy.location("pathname").should("eq", "/");
    });

    it("should set up Metabase", () => {
      // This is a simplified version of the "scenarios > setup" test
      cy.visit("/");
      cy.findByText("Welcome to Metabase");
      cy.url().should("not.include", "login");
      cy.findByTextEnsureVisible("Let's get started").click();

      // Language

      cy.findByText("What's your preferred language?");
      cy.findByText("English").click();
      cy.findByText("Next").click();

      // User (with workaround from "scenarios > setup"  document)

      cy.findByText("What should we call you?");

      cy.findByLabelText("First name").type(admin.first_name);
      cy.findByLabelText("Last name").type(admin.last_name);
      cy.findByLabelText("Email").type(admin.email);
      cy.findByLabelText("Company or team name").type("Epic Team");

      cy.findByLabelText("Create a password")
        .clear()
        .type(admin.password);
      cy.findByLabelText("Confirm your password")
        .clear()
        .type(admin.password);
      cy.findByText("Next").click();

      // Database

      cy.findByText("Add your data");
      cy.findByText("I'll add my data later");

      cy.findByText("Show more options").click();
      cy.findByText("H2").click();
      cy.findByLabelText("Display name").type("Metabase H2");

      const dbFilename = "frontend/test/__runner__/empty.db";
      const dbPath = Cypress.config("fileServerFolder") + "/" + dbFilename;
      cy.findByLabelText("Connection String").type(`file:${dbPath}`);
      cy.findByText("Connect database").click();

      // Turns off anonymous data collection
      cy.findByLabelText(
        "Allow Metabase to anonymously collect usage events",
      ).click();
      cy.findByText("All collection is completely anonymous.").should(
        "not.exist",
      );
      cy.findByText("Finish").click();

      // Finish & Subscribe

      cy.findByText("Take me to Metabase").click();
      cy.location("pathname").should("eq", "/");
    });
  });
});
