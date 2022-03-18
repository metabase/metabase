import {
  browse,
  popover,
  restore,
  modal,
  openPeopleTable,
  visualize,
  openNotebookEditor,
} from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

const { admin, normal, nocollection, nodata } = USERS;
const new_user = {
  first_name: "Barb",
  last_name: "Tabley",
  email: "new@metabase.test",
};

describe("smoketest > admin_setup", () => {
  before(restore);

  describe("successful setup by admin", () => {
    beforeEach(cy.signInAsAdmin);

    it("should add a new database", () => {
      // *** Need faux databases to hook up to
      // Should eventually include BigQuery, Druid, Google Analytics, H2, MongoDB, MySQL/Maria DB, PostgreSQL, Presto, Amazon Redshift, Snowflake, Spark SQL, SQLite, SQL Server

      cy.visit("/");

      // Navigate to page

      cy.icon("gear")
        .first()
        .click();
      cy.findByText("Admin settings").click();

      cy.findByText("Metabase Admin");
      cy.findByText("dashboard").should("not.exist");

      cy.findByText("Databases").click();

      cy.findByText("Sample Database");
      cy.findByText("Updates").should("not.exist");

      cy.findByText("Add database").click();

      cy.findByText("Show advanced options").click();

      cy.findByText("Rerun queries for simple explorations");

      // Add new database

      // cy.findByText("H2").click();
      // cy.findByText("PostgreSQL").click();
      // cy.findByLabelText("Name").type("Postgre Database");
      // cy.findByLabelText("Host").type("");
      // cy.findByLabelText("Port").type("");
      // cy.findByLabelText("Database name").type("");
      // cy.findByLabelText("Database username").type("");
      // cy.findByLabelText("Database password").type("");
      // cy.findByLabelText("Additional JDBC connection string options").type("");
      // cy.findByText("Save").click();
    });

    it("should set up email", () => {
      cy.findByText("Settings").click();
      cy.findByText("Email").click();

      cy.findByText("Email address you want to use as the sender of Metabase.");
      cy.findByText("Sample Database").should("not.exist");

      // Email info
      cy.findByLabelText("SMTP Host").type("localhost");
      cy.findByLabelText("SMTP Port").type("25");

      cy.findByLabelText("SMTP Username").type("admin");
      cy.findByLabelText("SMTP Password").type("admin");

      cy.findByLabelText("From Address").type("mailer@metabase.test");

      cy.button("Save changes").click();
      cy.findByText("Changes saved!");

      cy.findByText("Send test email").click();
      cy.findByText("Sent!");
    });

    it.skip("should setup Slack", () => {
      cy.findByText("Slack").click();

      cy.findByText("Answers sent right to your Slack #channels");

      cy.findByText("Create a Slack Bot User for MetaBot");
      cy.contains(
        'Once you\'re there, give it a name and click "Add bot integration". Then copy and paste the Bot API Token into the field below. Once you are done, create a "metabase_files" channel in Slack. Metabase needs this to upload graphs.',
      );
    });

    it("should create new groups", () => {
      cy.findByText("People").click();

      cy.findByText("2 other groups");

      cy.findAllByText("Groups")
        .first()
        .click();

      cy.findByText(
        "You can use groups to control your users' access to your data. Put users in groups and then go to the Permissions section to control each group's access. The Administrators and All Users groups are special default groups that can't be removed.",
        { exact: false },
      );
      cy.findByText("All Users");
      cy.findByText("Slack").should("not.exist");

      // Creates new group

      cy.findByText("Create a group").click();
      cy.get("input").type("Marketing");
      cy.findByText("Add").click();
      cy.findByText("Marketing").click();

      cy.findByText("A group is only as good as its members.");

      // Adds no collection user as member

      cy.findByText("Add members").click();
      cy.get("input").type("T");
      cy.findByText(
        nocollection.first_name + " " + nocollection.last_name,
      ).click();
      cy.findByText("Add").click();

      cy.findByText(nocollection.email);
      cy.findByText("A group is only as good as its members.").should(
        "not.exist",
      );

      // Adds self as member

      cy.findByText("Add members").click();
      cy.get("input").type("T");
      cy.findByText(admin.first_name + " " + admin.last_name).click();
      cy.findByText("Add").click();

      cy.findByText(admin.email);

      // Check member count

      // *** Unnecessary click (metabase#12693)
      cy.findAllByText("People")
        .last()
        .click();

      cy.findAllByText("2 other groups").should("have.length", 2);

      cy.findAllByText("Groups")
        .first()
        .click();

      cy.findByText("Marketing")
        .closest("tr")
        .contains("2");
    });

    it("should create new users in different groups", () => {
      cy.findAllByText("People")
        .last()
        .click();

      // Add new user into 2 groups

      cy.findByText("Invite someone").click();
      cy.findByLabelText("First name").type(new_user.first_name);
      cy.findByLabelText("Last name").type(new_user.last_name);
      cy.findByLabelText("Email").type(new_user.email);
      cy.findAllByText("Default")
        .last()
        .click();
      popover().within(() => {
        cy.findByText("collection").click({ force: true });
        cy.findByText("Marketing").click({ force: true });
      });
      cy.findByText("Create").click();
      cy.findByText("Done").click();

      // Check new user is in those groups

      cy.findByText(new_user.first_name + " " + new_user.last_name);
      cy.findAllByText("2 other groups").should("have.length", 3);

      // *** Unnecessary click (metabase#12693)
      cy.findAllByText("Groups")
        .first()
        .click();
      cy.findAllByText("People")
        .last()
        .click();

      cy.findAllByText("Groups")
        .first()
        .click();
      cy.findByText("Marketing")
        .closest("tr")
        .contains("3");

      cy.findByText("Marketing").click();

      cy.findByText(new_user.email);
      cy.findByText(nodata.email).should("not.exist");
    });

    it("should set up custom maps", () => {
      cy.findByText("Settings").click();
      cy.findByText("Maps").click();

      cy.findByText("Custom Maps");
      cy.findByText("Groups").should("not.exist");

      cy.findByText("Add a map").click();
      cy.findByPlaceholderText("e.g. United Kingdom, Brazil, Mars").type(
        "Test Map",
      );
      cy.findByPlaceholderText(
        "Like https://my-mb-server.com/maps/my-map.json",
      ).type(
        "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json",
      );
      cy.findByText("Load").click();
      cy.wait(2000)
        .findAllByText("Select…")
        .first()
        .click();
      cy.findByText("NAME").click();
      cy.findAllByText("Select…")
        .last()
        .click();
      cy.findAllByText("NAME")
        .last()
        .click();
      cy.findByText("Add map").click();

      cy.wait(3000)
        .findByText("NAME")
        .should("not.exist");
      cy.findByText("Test Map");
    });
  });

  describe("data model changes by admin reflected with user", () => {
    beforeEach(() => {
      cy.signOut();
      cy.signInAsAdmin();
    });

    it("should check table and question names as user", () => {
      // Log out as admin and sign in as user
      cy.signOut();
      cy.signInAsNormalUser();
      cy.visit("/");

      // Check names
      cy.wait(3000).contains("A look at your People table");
      cy.contains("A look at your Orders table");
      cy.contains("A look at your Test Table table").should("not.exist");

      cy.findByText("Browse all items").click();

      cy.get("h1").contains("Our analytics");
      cy.findByText("A look at your").should("not.exist");

      cy.findByText("Orders, Count");
      cy.findByText("Orders, Count, Grouped by Created At (year)");
      cy.findByText("Test Q Name Change").should("not.exist");
    });

    it("should rename a question and description as admin", () => {
      cy.visit("/");

      cy.findByText("Browse all items").click();

      cy.findByText("Other users' personal collections");
      cy.findByText("A look at your").should("not.exist");

      cy.findByText("Orders, Count, Grouped by Created At (year)").click();

      cy.findByText("Settings");

      cy.findByTestId("saved-question-header-button").click();
      cy.findByTestId("edit-details-button").click();
      cy.findByLabelText("Name")
        .clear()
        .type("Test Question");
      cy.findByLabelText("Description").type("Testing question description");
      cy.findByText("Save").click();
    });

    it("should rename a table and add a description as admin", () => {
      cy.visit("/");
      cy.icon("gear")
        .first()
        .click();
      cy.findByText("Admin settings").click();

      cy.findByText("Getting set up");
      cy.findByText(admin.first_name).should("not.exist");

      cy.findByText("Data Model").click();
      cy.findByText("Orders").click();
      cy.get(".TableEditor-table-name")
        .click()
        .type("abc", { delay: 100 })
        .clear()
        .type("Test Table");

      cy.get(
        "[value='Confirmed Sample Company orders for a product, from a user.']",
      )
        .clear()
        .type("Testing table description");
    });

    it("should change a column name, visibility, and formatting as admin", () => {
      cy.visit("/admin/datamodel/database/1/table/2");

      // Changing column name from Discount to Sale

      cy.wait(1000)
        .get("[value='Discount amount.'")
        .parent()
        .parent()
        .within(() => {
          cy.get("input")
            .first()
            .wait(1)
            .clear()
            .wait(1)
            .type("Sale");
        });

      // Changing visibility of Created At column

      cy.wait(2000)
        .get("[value='The date and time an order was submitted.']")
        .parent()
        .parent()
        .within(() => {
          cy.findByText("Everywhere").click();
        });
      cy.get(".ReactVirtualized__Grid__innerScrollContainer")
        .findAllByText("Do not include")
        .click(); // ({ force: true });

      // Changing column formatting to display USD instead of $

      cy.get("[value='The total billed amount.']")
        .parent()
        .parent()
        .within(() => {
          cy.icon("gear").click();
        });

      cy.findByText("Total – Field Settings");
      cy.findByText("Columns").should("not.exist");

      cy.findByText("Formatting").click();

      cy.findByText("Show a mini bar chart");
      cy.findByText("Everywhere").should("not.exist");

      cy.findByText("Normal").click();
      cy.findByText("Currency").click({ force: true });
      cy.findByText("Code (USD)")
        .parent()
        .click();
      cy.findByText("In every table cell").click();

      cy.findByText("Saved");
    });

    it("should reflect changes to column name, visibility, and formatting in the notebook editor for admin", () => {
      // Navigate
      cy.findByText("Exit admin").click({ force: true });

      // Checking table name

      cy.contains("A look at your Test Table table");
      cy.contains("A look at your Reviews table");
      cy.contains("A look at your Orders table").should("not.exist");

      // Navigating to Test Table table

      browse().click();
      cy.findByTextEnsureVisible("Sample Database").click();

      cy.icon("database").should("not.exist");

      cy.findByText("Test Table").click();

      // Checking three things in table display

      cy.wait(1)
        .findByText("Discount")
        .should("not.exist");
      cy.findByText("Sale ($)");

      cy.findByText("Created At").should("not.exist");

      cy.findByText("Total ($)").should("not.exist");
      cy.contains("USD");

      // Check column name and visibility in notebook editor

      cy.icon("notebook").click({ force: true });

      cy.wait(1000)
        .findByText("Orders")
        .should("not.exist");
      cy.findByText("Custom column");

      cy.findByText("Filter").click();
      cy.findByText("Sale");
      cy.findByText("Discount").should("not.exist");

      cy.findByText("Created At").should("not.exist");
    });

    it("should configure a foreign key to show the name as admin", () => {
      cy.visit("/admin/datamodel/database/1/table/2");

      // Configure Key

      cy.findByText("Metrics");
      cy.get("[value='Product ID'")
        .parent()
        .parent()
        .within(() => {
          cy.icon("gear").click();
        });
      cy.findByText("Plain input box").click();
      cy.findByText("Search box").click();
      cy.findByText("Use original value").click();
      cy.findByText("Use foreign key").click();
      cy.findByText("Title").click();

      cy.findByText(
        "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
      );

      // Check key config in table display

      cy.visit("/browse/1");
      cy.findByText("Test Table").click();

      cy.findByText("Product ID");
      cy.findAllByText("Awesome Concrete Shoes");
      cy.findAllByText("Mediocre Wooden Bench");
      cy.get(".Table-ID")
        .eq("1")
        .contains("14")
        .should("not.exist");

      // Check key config in notebook editor (pulls up title with ID #, not from actual title)

      cy.icon("notebook").click({ force: true });
      cy.wait(3000)
        .findByText("Filter")
        .click();
      cy.findAllByText("Product ID")
        .last()
        .click({ force: true });
      cy.get("input")
        .last()
        .type("Awesome Concrete");
      cy.wait(1000)
        .findAllByText("Awesome Concrete Shoes")
        .last()
        .click();
      cy.findByText("Add filter").click();

      visualize();

      cy.findAllByText("Awesome Concrete Shoes");
      cy.findByText("Mediocre Wooden Bench").should("not.exist");
    });

    it("should hide a table as admin", () => {
      cy.visit("/admin/datamodel/database/1/");

      // Hide table
      cy.findByText("Reviews")
        .find(".Icon-eye_crossed_out")
        .click({ force: true });

      cy.findByText("1 Hidden Table");

      // Check table hidden on home page
      cy.visit("/");

      cy.contains("A look at your People table");
      cy.contains("A look at your Reviews table").should("not.exist");

      // Check table hidden while browsing data

      cy.visit("/browse/1");

      cy.findByText("Learn about our data");
      cy.findByText("People");
      cy.findByText("Reviews").should("not.exist");

      // Check table hidden in notebook editor

      openPeopleTable({ mode: "notebook" });

      cy.findByText("Join data").click();

      popover()
        .should("contain", "People")
        .and("not.contain", "Reviews");
    });

    it("should see changes to visibility, formatting, and foreign key mapping as user", () => {
      cy.signOut();
      cy.signInAsNormalUser();
      cy.visit("/");

      // Check table names and visibility

      cy.contains("A look at your People table");
      cy.contains("A look at your Test Table table");
      cy.findByText("Reviews").should("not.exist");

      // Check question names and descriptions

      cy.findByText("Browse all items").click();

      cy.findByText("Orders, Count");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );

      cy.findByText("Test Question").click();
      cy.findByTestId("saved-question-header-button").click();
      cy.findByTestId("edit-details-button").click();

      cy.findByText("Edit question");
      modal().within(() => {
        cy.findByText("Testing question description");
      });

      cy.findByText("Cancel").click();

      // Check column names and visiblity

      browse().click();
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("Test Table").click();

      cy.findByText("Visualization");
      cy.findByText("Discount").should("not.exist");
      cy.findByText("Sale ($)");
      cy.findByText("Created At").should("not.exist");

      // Check column formatting

      cy.contains("USD");

      // Check column foreign key mapping

      cy.findAllByText("Awesome Concrete Shoes");
      cy.findByText("Mediocre Wooden Bench");
      cy.get(".Table-ID")
        .eq("1")
        .contains("14")
        .should("not.exist");
    });
  });

  describe("permission changes reflected", () => {
    beforeEach(cy.signInAsNormalUser);

    it("should check current permissions as users", () => {
      // Access to all tables as user
      cy.visit("/");

      cy.contains("A look at your People table");
      cy.contains("A look at your Test Table table");
      cy.findByText("A look at your Review table").should("not.exist");

      // Access to SQl queries as user

      cy.findByText("New").click();
      cy.findByText("SQL query");

      // Cannot see Review table as no collection user
      cy.signOut();
      cy.signIn("nocollection");
      cy.visit("/");

      cy.wait(2000).findByText("Try these x-rays based on your data");
      cy.contains("A look at your Test Table table");
      cy.contains("A look at your Review table").should("not.exist");

      // Cannot view our analytics as no collection user

      cy.findByText("Browse all items").click();
      cy.findByText("Orders").should("not.exist");
    });

    it("should modify user permissions for data access and SQL queries, both on a database/schema level as well as at a table level as admin", () => {
      // *** Need multible databases to test their permissions.

      cy.signOut();
      cy.signInAsAdmin();
      cy.visit("/");

      cy.icon("gear").click();
      cy.findByText("Admin settings").click();
      cy.findByText("Permissions").click();

      // Data access permissions (database/schema)

      // SQL queries permissions (database/schema)

      // Data access permissions (table)

      cy.findByText("All Users").click();

      cy.findByTextEnsureVisible("Sample Database").click();

      cy.findByText("Products");

      // Turn on data access for all users to Test Table
      cy.icon("eye")
        .eq(2)
        .click();

      cy.findAllByRole("option")
        .contains("Unrestricted")
        .click();

      cy.findByText("Change access to this database to limited?");

      cy.findByText("Change").click();

      cy.findByText("Marketing").click();

      cy.findByTextEnsureVisible("Sample Database").click();

      // Turn on data access for Marketing users to Products
      cy.icon("eye")
        .eq(1)
        .click();
      cy.findAllByRole("option")
        .contains("Unrestricted")
        .click();

      cy.findByText("Are you sure you want to do this?");

      cy.findByText("Change").click();

      cy.icon("warning");

      cy.findByText("Save changes").click();

      cy.contains(
        "All Users will be given access to 1 table in Sample Database.",
      );
      cy.findByText("Are you sure you want to do this?");

      cy.findByText("Yes").click();

      // SQL queries permissions (table)

      cy.findByText("Data permissions").click();

      cy.findByText("data").click();
      cy.icon("check")
        .eq(1)
        .click();

      popover().within(() => {
        cy.findByText("No").click();
      });

      cy.findByText("Save changes").click();

      cy.contains(
        "data will no longer be able to read or write native queries for Sample Database.",
      );
      cy.findByText("Yes").click();
    });

    it.skip("should add sub-collection and change its permissions as admin", () => {
      const subCollectionName = "test sub-collection";

      cy.signOut();
      cy.signInAsAdmin();

      cy.visit("/collection/root");

      cy.findByText("Our analytics");

      cy.findByText("New collection").click();

      cy.get(".Modal").within(() => {
        cy.findByLabelText("Name").type(subCollectionName);
        cy.findByLabelText("Description")
          .wait(1)
          .type(`Very nice description for ${subCollectionName}`);

        cy.icon("chevrondown").click();
      });

      popover().within(() => {
        cy.findAllByText("Our analytics")
          .last()
          .click();
      });
      cy.findByText("Create").click();

      // Changes permissions of sub-collection
      cy.findByText(subCollectionName).click();

      cy.findByText("This collection is empty, like a blank canvas");

      cy.icon("lock").click();

      cy.findByText(`Permissions for ${subCollectionName}`);

      // Collection can no longer access sub-collection
      cy.wait(1)
        .get(".Icon-check")
        .last()
        .click();
      cy.findByText("Revoke access").click();

      // Marketing now has access to sub-collection
      cy.icon("close")
        .last()
        .click();
      cy.findByText("Curate collection").click();

      cy.findByText("Save").click();

      cy.findByText("This collection is empty, like a blank canvas");
    });

    it.skip("should modify Collection permissions for top-level collections and sub-collections as admin", () => {
      cy.signOut();
      cy.signInAsAdmin();
      cy.visit("/admin/permissions/databases");

      // Modify permissions for top-level collection

      cy.findByText("Collection permissions").click();
      cy.icon("close")
        .eq(1)
        .click();
      cy.findByText("View collection").click();
      cy.findByText("Save changes").click();

      cy.findByText("Save permissions?");

      cy.findByText("Yes").click();

      cy.findByText("View sub-collections").click();

      // Give collection full access to sub-collection
      cy.icon("close")
        .last()
        .click();
      cy.findByText("Curate collection").click();
      // Revoke Marketing access to sub-collection
      cy.icon("check")
        .last()
        .click();
      cy.findByText("Revoke access").click();
      // Revoke data access to sub-collection
      cy.icon("eye").click();
      cy.findByText("Revoke access").click();
      cy.findByText("Save changes").click();

      cy.findByText("Save permissions?");

      cy.findByText("Yes").click();
      cy.findByText("Collection permissions").click();

      cy.icon("eye");
    });

    it("should be unable to access tables or questions that have been restricted as user", () => {
      cy.visit("/");

      // Normal user can still see everything

      cy.wait(2000).contains("A look at your Test Table table");
      cy.contains("A look at your Products table");

      // Normal user cannot make an SQL query

      openNotebookEditor({ fromCurrentPage: true });

      cy.signOut();
      cy.signIn("nocollection");
      cy.visit("/");

      // No collection user sees Test Table and People table

      cy.contains("A look at your Test Table table");
      cy.contains("A look at your People table");
      cy.contains("A look at your Reviews table").should("not.exist");
    });

    it.skip("should be unable to change questions in Our analytics as no collection user", () => {
      cy.findByText("Browse all items").click();

      cy.findByText("Everything");
      cy.findByText("Orders, Count");
      cy.findByText(
        'Access dashboards, questions, and collections in "Our analytics"',
      ).should("not.exist");

      cy.findByText("Orders").click();
      cy.findByText("Summarize").click();
      cy.wait(1000)
        .findAllByText("Quantity")
        .eq(1)
        .click();
      cy.findAllByText("Done").click();

      cy.findByText("Product ID").should("not.exist");
      cy.wait(1000).findByText("Quantity");

      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText('Replace original question, "Orders"').click();
      cy.findAllByText("Save")
        .last()
        .click();
      // *** There should be an error message here saying I'm not allowed to make any changes

      // Normal user should not see changes that no collection user made
      // *** Problem: Normal user still sees these changes

      cy.signOut();
      cy.signInAsNormalUser();
      cy.visit("/question/1");

      // cy.findByText("Product ID");
      // cy.findByText("Quantity").should("not.exist");
    });

    it.skip("should add a sub collection as a user", () => {
      cy.visit("/collection/root");

      cy.wait(3000)
        .findByText("New collection")
        .click();

      cy.findByLabelText("Name").type("test user added sub-collection");
      cy.findByLabelText("Description").type(
        "very descriptive of test user added sub-collection",
      );
      cy.icon("chevrondown").click();
      cy.findAllByText("Our analytics")
        .last()
        .click();

      cy.findByText("Create").click();

      cy.icon("all");
    });

    it.skip("should view collections I have access to, but not ones that I don't (even with URL) as user", () => {
      // Check access as normal user

      cy.visit("/collection/root");

      cy.findByText("My personal collection");
      cy.findByText("test sub-collection").click();

      cy.wait(3000).findByText("This collection is empty, like a blank canvas");
      cy.findByText("Sorry, you don’t have permission to see that.").should(
        "not.exist",
      );

      // Check editing abiltiy as no collection user (resetting to what we made it before)

      cy.icon("pencil");

      openNotebookEditor({ fromCurrentPage: true });
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("People").click();
      cy.findByText("Save").click();
      cy.findByLabelText("Name")
        .clear()
        .wait(1)
        .type("  sub-collection question  ");
      cy.findByText("Robert Tableton's Personal Collection").click();

      cy.findByText("My personal collection");

      cy.findByText("test sub-collection").click();
      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText("Not now").click();

      cy.contains("test sub-collection").click();

      cy.findByText("Sorry, you don’t have permission to see that.").should(
        "not.exist",
      );
      cy.contains("sub-collection question");

      // Check access as no collection user

      cy.signIn("nocollection");
      cy.visit("/");

      cy.findByText("test sub-collection").should("not.exist");

      cy.visit("/collection/6");

      cy.findByText("Sorry, you don’t have permission to see that.");
      cy.findByText("This collection is empty, like a blank canvas").should(
        "not.exist",
      );
    });

    it.skip("should be unable to access question with URL (if access not permitted)", () => {
      // This test will fail whenever the previous test fails
      cy.signIn("nocollection");

      cy.visit("/question/4");
      cy.contains("sub-collection question").should("not.exist");
      cy.findByText("Sorry, you don’t have permission to see that.");
    });

    it("user should not be able to login after admin deactivated them", () => {
      const FULL_NAME = normal.first_name + " " + normal.last_name;

      cy.signOut();
      cy.signInAsAdmin();

      cy.visit("/admin/settings/setup");
      cy.findByText("People").click();

      openEllipsisMenuForUser(FULL_NAME);
      cy.findByText("Deactivate user").click();

      cy.findByText(`${FULL_NAME} won't be able to log in anymore.`);
      cy.button("Deactivate").click();
      cy.findByText(FULL_NAME).should("not.exist");

      // User tries to log in
      cy.signOut();
      cy.visit("/");
      cy.findByLabelText("Email address").type(normal.email);
      cy.findByLabelText("Password").type(normal.password);
      cy.button("Sign in").click();

      cy.findByText("Failed");
      cy.contains("Your account is disabled.");
    });
  });
});

function openEllipsisMenuForUser(user) {
  cy.findByText(user)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click();
}
