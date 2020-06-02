import path from "path";
import { USERS, restore, signInAsAdmin } from "__support__/cypress";

const ADMIN = USERS.admin

describe("metabase-smoketest > admin", () => {
    before(() => restore("blank"));

    it("should set up Metabase", () => {
        // This is a simplified version of the "scenarios > setup" test
        cy.visit("/");
        cy.findByText("Let's get started").click()
        
        // Language

        cy.findByText("What's your preferred language");
        cy.findByText("English").click();
        cy.findByText("Next").click();

        // User (with workaround from "scenarios > setup"  document)
        
        cy.findByText("Next")
          .closest("button")
          .should("be.disabled");
        
        cy.findByLabelText("First name").type(ADMIN.first_name);
        cy.findByLabelText("Last name").type(ADMIN.last_name);
        cy.findByLabelText("Email").type(ADMIN.username);
        cy.findByLabelText("Your company or team name").type("Epic Team");
    
        cy.findByLabelText("Create a password")
            .clear()
            .type(ADMIN.password);
        cy.findByLabelText("Confirm your password")
            .clear()
            .type(ADMIN.password);
        cy.findByText("Next").click();
        
        // Database

        cy.findByText("Select a database").click();
        cy.findByText("H2").click();
        cy.findByLabelText("Name").type("Metabase H2");
        
        const dbPath = path.resolve(
            Cypress.config("fileServerFolder"),
            "frontend/test/__runner__/empty.db",
        );
        cy.findByLabelText("Connection String").type(`file:${dbPath}`);
        cy.findByText("Next").click();
        
        cy.findByText("Next").click();

        // Finish & Subscribe

        cy.findByText("Take me to Metabase").click();
        cy.url().should("be", "/");

        // =================
        // should add a simple summarized question
        // =================

        cy.findByText("Ask a question").click()        
        cy.findByText("Simple question").click()
        // Selecting Metabase H2 doesn't do anything
        cy.findByText("Sample Dataset").click()
        cy.findByText("People").click()
        
        cy.findByText("Filter", {timeout: 20000}).click()
        cy.get(".scroll-y")
            .contains("Created At")
            .click()
        // Set timing to previous 12 months ('Previous' already selected)
        cy.get("input[type='text']")
            .type("{backspace}{backspace}5")
        cy.findByText("Days").click()
        cy.findByText("Years").click()
        cy.get(".scroll-y")
            .contains("Add filter")
            .click();

        cy.get(".Button")
            .contains("Summarize")
            .click()
        cy.findByText("Source").click()
        cy.findByText("Done").click()

        // Check that response is a bar graph'
        
        cy.findByText("Save").click()
        cy.get("input[name='name']")
            .type("{selectall}{del}People per Source")
        // Test can't find this input... 
        // cy.get("input[name='description']")
        //     .type("Bar graph illustrating where our customers come from")
        // Default: saves to Our analytics
        cy.get(".ModalContent")
            .get(".Button")
            .contains("Save")
            .click()
        cy.findByText("Yes please!").click()
        cy.findByText("Create a new dashboard").click()
        cy.get("input[name='name']")
            .type("Demo Dash")
        // Test can't find this input either...
        // cy.get("input[name='description']")
        //     .type("Many demos live here")
        cy.findByText("Create").click()
        
        cy.contains("Save").click()

        // =================
        // should add a simple JOINed question"
        // =================

        // =================
        // should add a questionw ith a default line visualization
        // =================

        // =================
        // should add a new dashboard with the previous questions
        // =================

        // =================
        // should add a new user
        // ================= 
    }); 
})
