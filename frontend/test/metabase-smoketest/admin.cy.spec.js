import { USERS, restore } from "__support__/cypress";

const ADMIN = USERS.admin

describe("metabase-smoketest > admin", () => {
    before(() => restore("blank"));

    it("should set up Metabase", () => {
        // This is a simplified version of the "scenarios > setup" test
        cy.visit("/");

        // ========
        // Language
        // ========

        cy.findByText("What's your preferred language");
        cy.findByText("English").click();
        cy.findByText("Next").click();

        // ========
        // User (with workaround from "scenarios > setup"  document)
        // ========

        cy.findByText("Next")
          .closest("button")
          .should("be.disabled");
        
        cy.findByLabelText("First name").type(ADMIN.first_name);
        cy.findByLabelText("Last name").type(ADMIN.last_name);
        cy.findByLabelText("Email").type(ADMIN.username);
        cy.findByLabelText("Your company or team name").type("Epic Team");
    
        const strongPassword = "QJbHYJN3tPW[";
        cy.findByLabelText("Create a password")
            .clear()
            .type(strongPassword);
        cy.findByLabelText("Confirm your password")
            .clear()
            .type(strongPassword);
        cy.findByText("Next").click();

        // ========
        // Database
        // ========

        cy.findByText("Select a database").click();
        cy.findByText("H2").click();
        cy.findByLabelText("Name").type("Metabase H2");
        cy.findByText("Next")
            .closest("button")
            .should("be.disabled");
        
        const dbPath = path.resolve(
            Cypress.config("fileServerFolder"),
            "frontend/test/__runner__/empty.db",
        );
        cy.findByLabelText("Connection String").type(`file:${dbPath}`);
        cy.findByText("Next")
            .closest("button")
            .should("not.be.disabled")
            .click();
        
        // ==================
        // Finish & Subscribe
        // ==================

        cy.findByText("Take me to Metabase").click();
        cy.url().should("be", "/");
    })
        // should add a simple summarized question
        // should add a simple JOINed question
        // should add a questionw ith a default line visualization
        // should add a new dashboard with the previous questions
        // should add a new user
})