import path from "path";
import { USERS, restore, main, signOut } from "__support__/cypress";

const admin = USERS.admin;
const new_user = {
  first_name: "Barb",
  last_name: "Tabley",
  username: "new@metabase.com",
};

describe("metabase-smoketest > admin", () => {
  before(() => restore("blank"));

  it("should set up Metabase", () => {
    // ****************
    // ***  ADMIN   ***
    // *****************

    // This is a simplified version of the "scenarios > setup" test
    cy.visit("/");
    cy.contains("Welcome to Metabase");
    cy.url().should("not.include", "login");
    cy.findByText("Let's get started").click();

    // Language

    cy.contains("What's your preferred language");
    cy.findByText("English").click();
    cy.findByText("Next").click();

    // User (with workaround from "scenarios > setup"  document)

    cy.contains("What should we call you?");

    cy.findByLabelText("First name").type(admin.first_name);
    cy.findByLabelText("Last name").type(admin.last_name);
    cy.findByLabelText("Email").type(admin.username);
    cy.findByLabelText("Your company or team name").type("Epic Team");

    cy.findByLabelText("Create a password")
      .clear()
      .type(admin.password);
    cy.findByLabelText("Confirm your password")
      .clear()
      .type(admin.password);
    cy.findByText("Next").click();

    // Database

    cy.contains("Add your data");
    cy.contains("I'll add my data later");

    cy.findByText("Select a database").click();
    cy.findByText("H2").click();
    cy.findByLabelText("Name").type("Metabase H2");

    const dbPath = path.resolve(
      Cypress.config("fileServerFolder"),
      "frontend/test/__runner__/empty.db",
    );
    cy.findByLabelText("Connection String").type(`file:${dbPath}`);
    cy.findByText("Next").click();

    // Turns off anonymous data collection
    cy.findByLabelText(
      "Allow Metabase to anonymously collect usage events",
    ).click();
    cy.findByText("All collection is completely anonymous.").should(
      "not.exist",
    );
    cy.findByText("Next").click();

    // Finish & Subscribe

    cy.findByText("Take me to Metabase").click();
    cy.url().should("be", "/");

    // =================
    // should add a simple summarized question
    // =================

    cy.contains("Bobby");
    // This page does not contain "OUR DATA"
    cy.contains("Our analytics", { timeout: 10000 });

    // Following section is repeated-- turn into callback function?
    // Also, selecting Metabase H2 doesn't do anything
    cy.findByText("Ask a question").click();

    cy.contains("Custom question");
    cy.contains("Native query");

    cy.findByText("Simple question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("People").click();

    cy.contains("Save");

    // Filter for created within previous 5 years

    cy.findByText("Filter").click();
    cy.get(".scroll-y")
      .contains("Created At", { timeout: 20000 })
      .click();
    cy.get("input[type='text']")
        .clear()
        .type("5");
    cy.findByText("Days").click();
    cy.findByText("Years").click();
    cy.get(".scroll-y")
      .contains("Add filter")
      .click();

    // Summarize by source

    cy.get(".Button")
      .contains("Summarize")
      .click();
    cy.findByText("Source").click();
    cy.findByText("Done").click();

    cy.contains("Created At  Previous 5 Years");
    cy.contains("Source");
    cy.contains("Google");

    // =================
    // should add question to a new dashboard in my personal collection
    // =================

    cy.findByText("Save").click();
    cy.findByLabelText("Name")
      .clear()
      .type("People per Source");
    cy.findByLabelText("Description").type(
      "Bar graph illustrating where our customers come from",
    );
    // When I select 'My personal collection' I get the error "Referential integrity constraint violation:"
    // cy.findByText("Our analytics").click();
    // cy.findByText("My personal collection").click().pause();
    // cy.contains("My personal collection");
    cy.get(".ModalContent")
      .get(".Button")
      .contains("Save")
      .click();
    cy.findByText("Yes please!").click();
    cy.findByText("Create a new dashboard").click();
    cy.findByLabelText("Name").type("Demo Dash");
    cy.findByLabelText("Description").type("Many demos live here");
    cy.findByText("Create").click();

    cy.contains("People per");
    cy.contains("This dashboard is loooking empty").should("not.exist");

    cy.contains("Save").click();

    // =================
    // should add a simple JOINed question
    // =================

    cy.findByText("Ask a question");

    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();

    // Join tables
    cy.get(".Icon-notebook", { timeout: 30000 }).click();

    cy.contains("Data");
    cy.contains("Showing").should("not.exist");

    cy.findByText("Join data").click();
    cy.findByText("People").click();
    cy.findByText("Visualize").click();

    // Summarize by State
    cy.get(".Button", { timeout: 30000 })
      .contains("Summarize")
      .click();
    cy.findByText("State").click();
    cy.findByText("Done").click();

    cy.get(".Icon-pinmap");
    cy.get(".Icon-table").should("not.exist");

    // Save question (not to a dashboard)
    cy.findByText("Save").click();
    cy.findByLabelText("Name")
      .clear()
      .type("Order Totals by State");
    cy.get(".ModalContent")
      .get(".Button")
      .contains("Save")
      .click();
    cy.findByText("Not now").click();

    // =================
    // should add a question with a default line visualization
    // =================

    cy.findByText("Ask a question").click();

    cy.contains("Native query");

    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();

    cy.contains("Product ID");
    cy.contains("Pick your data").should("not.exist");

    // Summarize by date ordered
    cy.get(".Button", { timeout: 30000 })
      .contains("Summarize")
      .click();
    cy.get(".scroll-y")
      .contains("Created At")
      .click();
    cy.findByText("Done").click();

    cy.get(".Icon-line");

    // Save question (not to a dashboard)
    cy.findByText("Save").click();
    cy.findByLabelText("Name")
      .clear()
      .type("Orders Over Time");
    cy.get(".ModalContent")
      .get(".Button")
      .contains("Save")
      .click();
    cy.findByText("Not now").click();

    // =================
    // should create a new dashboard with the previous questions
    // =================

    // New dashboard
    cy.get(".Icon-add").click();
    cy.findByText("New dashboard").click();

    cy.contains("Which collection should this go in?");

    cy.findByLabelText("Name").type("Demo Dash 2");
    cy.findByText("Create").click();

    // Adding saved questions
    cy.get(".Header-buttonSection").click("left");
    cy.findByText("Order Totals by State").click();
    cy.get(".Header-buttonSection").click("left");
    cy.findByText("Orders Over Time").click();

    cy.contains("Order Totals by State");
    cy.contains("Orders Over Time");

    cy.findByText("Save").click();

    // ================
    // should add a new user
    // =================
    
    // Sets up route
    cy.server()
    cy.route({
      method: "POST",
      url: "/api/user",
    }).as("createUser");

    // Navigates through admin pages
    cy.get(".Nav")
      .children()
      .last()
      .children()
      .last()
      .click();
    cy.findByText("Admin").click();

    cy.contains("Metabase Admin");
    cy.contains("dashboard").should("not.exist");

    cy.findByText("People").click();

    cy.contains("Groups");

    // Inputs user info (first modal)
    cy.findByText("Add someone").click();
    cy.findByLabelText("First name").type(new_user.first_name);
    cy.findByLabelText("Last name").type(new_user.last_name);
    cy.findByLabelText("Email").type(new_user.username);
    cy.get(".ModalBody")
      .find(".Icon-chevrondown")
      .click();
    cy.findByText("English").click();
    cy.findByText("Create").click();
    
    cy.wait("@createUser").then(xhr => {
        cy.wrap(xhr.request.body.password).as("password");
      });
    
    //  Password confirmation(second modal) 
    cy.contains("has been added")
    cy.findByText("Done").click();

    cy.contains(new_user.username);

    // ****************
    // *** NEW USER ***
    // *****************

    // =================
    // New user can sign in
    // =================

    signOut();
    cy.get("@password").then(pass => {
      cy.visit("/");
      cy.findByLabelText("Email address").type(new_user.username);
      cy.findByLabelText("Password").type(pass);
      cy.findByText("Sign in").click();
      cy.contains(new_user.first_name);

    // =================
    // should see questions currently in the "Our Analytics" collection
    // =================

    cy.findByText("Browse all items").click()
    cy.contains("My personal collection")

    // =================
    // should see dashboard in the "Our Analytics" collection
    // =================

    cy.findByText("Dashboards").click();
    cy.contains("Demo Dash 2");

    // =================
    // Create my own question
    // =================

    cy.findByText("Ask a question").click();
    
    cy.contains("Native query");

    cy.findByText("Simple question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Reviews").click();

    cy.get(".Button")
        .contains("Summarize")
        .click();
    cy.get(".scroll-y")
      .contains("Rating", { timeout: 20000 })
      .click();
    cy.findByText("Done").click();

    cy.contains("Auto binned");
    cy.get(".Icon-bar");

    // =================
    // Create my own dashboard
    // =================

    cy.get(".Icon-add").click();
    cy.findByText("New dashboard").click();
    cy.findByLabelText("Name").type("New User Demo Dash");
    cy.findByLabelText("Description").type("This is my own demo dash!");
    cy.get(".ModalBody")
        .find(".Icon-chevrondown")
        .click();
    cy.findAllByText("Our analytics").last().click();
    // Also cannot select "My personal collection" here
    cy.findByText("Create").click();

    cy.contains("This dashboard is looking empty");
    });
  });
});
