import path from "path";
import { restore, sidebar } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

const { admin } = USERS;
const new_user = {
  first_name: "Barb",
  last_name: "Tabley",
  email: "new@metabase.test",
};

describe("metabase-smoketest > admin", () => {
  before(() => restore("blank"));

  describe("Admin can setup an account", () => {
    it("should set up Metabase", () => {
      // This is a simplified version of the "scenarios > setup" test
      cy.visit("/");
      cy.findByText("Welcome to Metabase");
      cy.url().should("not.include", "login");
      cy.findByText("Let's get started").click();

      // Language

      cy.findByText("What's your preferred language?");
      cy.findByText("English").click();
      cy.findByText("Next").click();

      // User (with workaround from "scenarios > setup"  document)

      cy.findByText("What should we call you?");

      cy.findByLabelText("First name").type(admin.first_name);
      cy.findByLabelText("Last name").type(admin.last_name);
      cy.findByLabelText("Email").type(admin.email);
      cy.findByLabelText("Your company or team name").type("Epic Team");

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
      cy.location("pathname").should("eq", "/");
    });
  });

  describe("Admin has basic functionality", () => {
    beforeEach(cy.signInAsAdmin);

    it.skip("should add a simple summarized question as admin", () => {
      cy.visit("/");
      cy.contains(", " + admin.first_name);
      // This page does not contain "OUR DATA"
      cy.findByText("Our analytics");

      // Following section is repeated-- turn into callback function?
      // Also, selecting Metabase H2 doesn't do anything
      cy.findByText("Ask a question").click();

      cy.findByText("Custom question");
      cy.findByText("Native query");

      cy.findByText("Simple question").click();
      cy.findByText("Sample Dataset").click();
      cy.findByText("People").click();

      cy.findByText("Save");

      // Filter for created within previous 5 years

      cy.findByText("Filter").click();
      cy.findAllByText("Created At")
        .last()
        .click();
      cy.get("input[type='text']").type("{selectall}{del}5");
      cy.findByText("Days").click();
      cy.findByText("Years").click();
      sidebar()
        .findByText("Add filter")
        .click();

      // Summarize by source

      cy.get(".Button")
        .contains("Summarize")
        .click();
      cy.findByText("Source").click();
      cy.findByText("Done").click();

      cy.contains("Created At  Previous 5 Years");
      cy.findByText("Source");
      cy.findByText("Google");
    });

    it.skip("should add question to a new dashboard in my personal collection as admin", () => {
      cy.findByText("Save").click();
      cy.findByLabelText("Name")
        .clear()
        .type("People per Source");
      cy.findByLabelText("Description").type(
        "Bar graph illustrating where our customers come from",
      );

      // *** Cannot select 'My personal collection' (metabase#12718)
      // cy.findByText("Our analytics").click();
      // cy.findByText("My personal collection").click();
      // cy.contains("My personal collection");
      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText("Yes please!").click();
      cy.findByText("Create a new dashboard").click();
      cy.findByLabelText("Name").type("Demo Dash");
      cy.findByLabelText("Description").type("Many demos live here");
      cy.findByText("Create").click();

      cy.contains("People per");
      cy.findByText("This dashboard is looking empty").should("not.exist");

      cy.findByText("Save").click();
    });

    it.skip("should add a simple JOINed question as admin", () => {
      cy.visit("/");
      cy.findByText("Ask a question");

      cy.findByText("Ask a question").click();
      cy.findByText("Simple question").click();
      cy.findByText("Sample Dataset").click();
      cy.findByText("Orders").click();

      // Join tables
      cy.icon("notebook").click();

      cy.findByText("Data");
      cy.findByText("Showing").should("not.exist");

      cy.findByText("Join data").click();
      cy.findByText("People").click();
      cy.button("Visualize").click();

      // Summarize by State
      cy.findAllByText("Summarize")
        .first()
        .click();
      cy.findByText("State").click();
      cy.findByText("Done").click();

      cy.icon("pinmap");
      cy.icon("table").should("not.exist");

      // Save question (not to a dashboard)
      cy.findByText("Save").click();
      cy.findByLabelText("Name")
        .clear()
        .type("Order Totals by State");
      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText("Not now").click();
    });

    it("should add a question with a default line visualization as admin", () => {
      cy.visit("/");
      cy.findByText("Ask a question").click();

      cy.findByText("Native query");

      cy.findByText("Ask a question").click();
      cy.findByText("Simple question").click();
      cy.findByText("Sample Dataset").click();
      cy.findByText("Orders").click();

      cy.findByText("Product ID");
      cy.findByText("Pick your data").should("not.exist");

      // Summarize by date ordered
      cy.findAllByText("Summarize")
        .first()
        .click();
      sidebar()
        .contains("Created At")
        .click();
      cy.findByText("Done").click();

      cy.icon("line").should("have.length", 2);

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
    });

    it.skip("should create a new dashboard with the previous questions as admin", () => {
      cy.visit("/");
      // New dashboard
      cy.icon("add").click();
      cy.findByText("New dashboard").click();

      cy.findByText("Which collection should this go in?");

      cy.findByLabelText("Name").type("Demo Dash 2");
      cy.findByText("Create").click();

      // Adding saved questions
      cy.get(".Header-buttonSection").click("left");
      cy.findByText("Order Totals by State").click();
      cy.wait(2000).get(".Icon-string");
      cy.get(".Header-buttonSection").click("left");
      cy.findByText("Orders Over Time").click();

      cy.contains("Order Totals by State");
      cy.contains("Orders Over Time");

      cy.findByText("Save").click();
    });

    it.skip("should add a new user who can perform basic functions", () => {
      // Sets up route
      cy.server();
      cy.route({
        method: "POST",
        url: "/api/user",
      }).as("createUser");

      // Navigates through admin pages
      cy.visit("/");
      cy.icon("gear").click();
      cy.findByText("Admin").click();

      cy.findByText("Metabase Admin");
      cy.findByText("dashboard").should("not.exist");

      cy.findByText("People").click();

      cy.findAllByText("Groups");

      // Inputs user info (first modal)
      cy.findByText("Invite someone").click();
      cy.findByLabelText("First name").type(new_user.first_name);
      cy.findByLabelText("Last name").type(new_user.last_name);
      cy.findByLabelText("Email").type(new_user.email);
      cy.findByText("Create").click();

      cy.wait("@createUser").then(xhr => {
        cy.wrap(xhr.request.body.password).as("password");
      });

      //  Password confirmation(second modal)
      cy.contains("has been added");
      cy.findByText("Done").click();

      cy.findByText(new_user.email);

      // ==============
      // == NEW USER ==
      // ==============

      cy.signOut();
      cy.get("@password").then(pass => {
        cy.visit("/");
        cy.findByLabelText("Email address").type(new_user.email);
        cy.findByLabelText("Password").type(pass);
        cy.findByText("Sign in").click();
        cy.contains(new_user.first_name);

        // =================
        // should see questions currently in the "Our Analytics" collection
        // =================
        cy.findByText("Browse all items").click();
        cy.findByText("My personal collection");

        // =================
        // should see dashboard in the "Our Analytics" collection
        // =================
        cy.findByText("Dashboards").click();
        // cy.findByText("");

        cy.findAllByText("Demo Dash 2").click();

        cy.icon("move");
        cy.findByText("Created At");

        cy.findByText("Orders Over Time").click();
        cy.findByText(
          "You won't make any permanent changes to a saved question unless you click Save and choose to replace the original question.",
        );
        cy.findByText("Okay").click();

        cy.findByText("Orders Over Time");
        cy.icon("line");
        cy.findByText("Demo Dash 2").should("not.exist");

        // =================
        // should create my own question as user
        // =================
        cy.findByText("Ask a question").click();

        cy.findByText("Native query");

        cy.findByText("Simple question").click();
        cy.findByText("Sample Dataset").click();
        cy.findByText("Reviews").click();

        cy.get(".Button")
          .findByText("Summarize")
          .click();
        cy.findAllByText("Rating")
          .last()
          .click();
        cy.findByText("Done").click();

        cy.contains("Auto binned");
        cy.icon("bar");

        cy.findByText("Save").click();
        cy.findByLabelText("Name")
          .clear()
          .type("Number of Reviews by Range of Rating");
        cy.icon("chevrondown").click();
        cy.findAllByText("Our analytics")
          .last()
          .click();
        // *** Won't save into personal collection (metabase#12718)
        // cy.findByText("My personal collection").click();
        cy.findAllByText("Save")
          .last()
          .click();
        cy.findByText("Not now").click();

        // =================
        // should create my own dashboard as user
        // =================
        cy.icon("add").click();
        cy.findByText("New dashboard").click();
        cy.findByLabelText("Name").type("New User Demo Dash");
        cy.findByLabelText("Description").type("This is my own demo dash!");
        cy.get(".ModalBody")
          .find(".Icon-chevrondown")
          .click();
        cy.findAllByText("Our analytics")
          .last()
          .click();
        // *** Won't save into personal collection (metabase#12718)
        cy.findByText("Create").click();

        cy.findByText("This dashboard is looking empty.");
        cy.contains("Number of").should("not.exist");

        cy.icon("add")
          .last()
          .click();
        cy.findByText("Number of Reviews by Range of Rating").click();
        cy.findByText("Save").click();

        cy.contains("Number of");
        cy.findByText("This dashboard is looking empty.").should("not.exist");
      });
    });
  });
});
