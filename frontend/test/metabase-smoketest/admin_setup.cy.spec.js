import { restore, USERS, signInAsAdmin } from "__support__/cypress";

describe("smoketest > admin_setup", () => {
  before(restore);
  before(signInAsAdmin);

  it("should have admin changes reflected with the user account", () => {
    cy.visit("/")

    // *******************************
    // *** Admin > Successful Setup **
    // ********************************

    // =================
    // should add a new database
    // *** I don't have any faux databases to hook up to. Are there some in the system already?
    // *** Should eventually include BigQuery, Druid, Google Analytics, H2, MongoDB, MySQL/Maria DB, PostgreSQL, Presto, Amazon Redshift, Snowflake, Spark SQL, SQLite, SQL Server
    // =================

    // Navigate to page
    
    cy.get(".Nav")
      .children()
      .last()
      .children()
      .last()
      .click();
    cy.findByText("Admin").click();

    cy.contains("Metabase Admin");
    cy.contains("dashboard").should("not.exist");

    cy.findByText("Databases").click();
    
    cy.contains("Sample Dataset");
    cy.contains("Updates").should("not.exist");
    
    cy.findByText("Add database").click();

    cy.contains("Automatically run queries when doing simple filtering and summarizing");

    // Adds new database

    // cy.findByText("H2").click();
    // cy.findByText("PostgreSQL").click();
    // cy.findByLabelText("Name").type("Postgre Database");
    // cy.findByLabelText("Host");

    // =================
    // should setup email (maybe using something like maildev)
    // =================

    // =================
    // should setup Slack
    // =================
    // =================
    // should create new groups
    // =================
    // =================
    // should create new users in different groups
    // =================
    // =================
    // should set up custom maps
    // =================


    // ********************************
    // * Data Model Changes Reflected *
    // *********************************

    // =================
    // should sign in as new user
    // =================
    // =================
    // should change password as user
    // =================
    // =================
    // should check table names as user
    // =================
    // =================
    // should rename a table as admin
    // =================
    // =================
    // should add a description to a table as admin
    // =================
    // =================
    // should change a column name as admin
    // =================
    // =================
    // should change a column's visibility (and have it be reflected in notebook editor) as admin
    // =================
    // =================
    // should change a columns formatting (and have it be reflected in notebook editor) as admin
    // =================
    // =================
    // should configure a foreign key to show the name (and have it be reflected in notebook editor) as admin
    // =================
    // =================
    // should hide a table (and have it be reflected in the notebook editor) as admin
    // =================
    // =================
    // should see changes to visibility, formatting, and foreign key mapping as user
    // =================


    // *********************************
    // ** Permission Changes Reflected *
    // *********************************
    
    // =================
    // should check current permissions as user
    // =================
    // =================
    // should modify user permissions for data access and SQL queries, both on a database/schema level as well as at a table level as admin
    // =================
    // =================
    // should modify Collection permissions for top-level collections and sub-collections as admin
    // =================
    // =================
    // should no longer be able to access tables or questions that have been restricted as user
    // =================
    // =================
    // should be able to view collections I have access to, but not ones that I don't (even with URL) as user
    // =================
    // =================
    // should deactivate a user admin and subsequently user should be unable to login
    // =================
  });
});
