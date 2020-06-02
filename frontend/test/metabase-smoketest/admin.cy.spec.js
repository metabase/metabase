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
        
        // Following section is repeated-- turn into callback function?
        // Also, selecting Metabase H2 doesn't do anything
        cy.findByText("Ask a question").click()        
        cy.findByText("Simple question").click()
        cy.findByText("Sample Dataset").click()
        cy.findByText("People").click()
        
        // Filter for created within previous 5 years

        cy.findByText("Filter", {timeout: 20000}).click()
        cy.get(".scroll-y")
            .contains("Created At")
            .click()
        cy.get("input[type='text']")
            .type("{backspace}{backspace}5")
        cy.findByText("Days").click()
        cy.findByText("Years").click()
        cy.get(".scroll-y")
            .contains("Add filter")
            .click();
        
        // Summarize by source
        
        cy.get(".Button")
            .contains("Summarize")
            .click()
        cy.findByText("Source").click()
        cy.findByText("Done").click()

        // =================
        // should add question to a new dashboard
        // =================
        
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
        // Test can't find this description input either... should type: "Many demos live here"
        cy.findByText("Create").click()
        
        cy.contains("Save").click()

        // =================
        // should add a simple JOINed question
        // =================
        
        cy.findByText("Ask a question")
        
        cy.findByText("Ask a question").click()        
        cy.findByText("Simple question").click()
        cy.findByText("Sample Dataset").click()
        cy.findByText("Orders").click()
        
        // Join tables
        cy.get(".Icon-notebook", {timeout: 30000}).click()
        cy.findByText("Join data").click()
        cy.findByText("People").click()
        cy.findByText("Visualize").click()
        
        // Summarize by State
        cy.get(".Button", {timeout: 30000})
            .contains("Summarize")
            .click()
        cy.findByText("State").click()
        cy.findByText("Done").click()

        // Save question (not to a dashboard)
        cy.findByText("Save").click()
        cy.get("input[name='name']")
            .type("{selectall}{del}Order Totals by State")
        cy.get(".ModalContent")
            .get(".Button")
            .contains("Save")
            .click()
        cy.findByText("Not now").click()

        // =================
        // should add a question with a default line visualization
        // =================
        
        cy.findByText("Ask a question").click()

        cy.findByText("Ask a question").click()        
        cy.findByText("Simple question").click()
        cy.findByText("Sample Dataset").click()
        cy.findByText("Orders").click()

        // Summarize by date ordered
        cy.get(".Button", {timeout: 30000})
            .contains("Summarize")
            .click()
        cy.get(".scroll-y")
            .contains("Created At")
            .click()
        cy.findByText("Done").click()

        // checks that default is a line visualisation
        cy.get(".Icon-line")

        // Save question (not to a dashboard)
        cy.findByText("Save").click()
        cy.get("input[name='name']")
            .type("{selectall}{del}Order Totals by State")
        cy.get(".ModalContent")
            .get(".Button")
            .contains("Save")
            .click()
        cy.findByText("Not now").click()

        // =================
        // should add a new dashboard with the previous questions
        // =================

        // =================
        // should add a new user
        // ================= 
    }); 
})
