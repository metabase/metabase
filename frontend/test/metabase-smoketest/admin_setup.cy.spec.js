import { restore, USER, signIn } from "__support__/cypress";

describe("smoketest > admin_setup", () => {
    it("should be able to setup environment for team as admin", () => {
        // =================
        // should add a new database
        // Should eventually include BigQuery, Druid, Google Analytics, H2, MongoDB, MySQL/Maria DB, PostgreSQL, Presto, Amazon Redshift, Snowflake, Spark SQL, SQLite, SQL Server
        // =================
        


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
    });

    it("should should refelct modifications to data models in the users' account", () => {
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
    });

    it("should should refelct modifications to permissions in the users' account", () => {
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