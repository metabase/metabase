import {
  restore,
  signInAsAdmin,
  USERS,
  signOut,
  signInAsNormalUser,
  signIn,
  setupLocalHostEmail,
} from "__support__/cypress";

const new_user = {
  first_name: "Barb",
  last_name: "Tabley",
  username: "new@metabase.com",
};

describe("smoketest > admin_setup", () => {
  before(restore);

  describe("successful setup by admin", () => {
    beforeEach(signInAsAdmin);

    it("should add a new database", () => {
      // *** Need faux databases to hook up to
      // Should eventually include BigQuery, Druid, Google Analytics, H2, MongoDB, MySQL/Maria DB, PostgreSQL, Presto, Amazon Redshift, Snowflake, Spark SQL, SQLite, SQL Server

      cy.visit("/");

      // Navigate to page

      cy.get(".Icon-gear")
        .first()
        .click();
      cy.findByText("Admin").click();

      cy.findByText("Metabase Admin");
      cy.findByText("dashboard").should("not.exist");

      cy.findByText("Databases").click();

      cy.findByText("Sample Dataset");
      cy.findByText("Updates").should("not.exist");

      cy.findByText("Add database").click();

      cy.findByText(
        "Automatically run queries when doing simple filtering and summarizing",
      );

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

    it.skip("should setup email", () => {
      cy.findByText("Settings").click();
      cy.findByText("Email").click();

      cy.findByText("Email address you want to use as the sender of Metabase.");
      cy.findByText("Sample Database").should("not.exist");

      setupLocalHostEmail();

      // *** Will fail if test works correctly:
      cy.wait(2000)
        .findByText("Sent!")
        .should("not.exist");

      // *** Uncomment when test works correctly:
      // cy.findByText("Sent!");
      // cy.findByText("Sorry, something went wrong.  Please try again").should(
      //   "not.exist",
      // );
    });

    it.skip("should setup Slack", () => {
      cy.findByText("Slack").click();

      cy.findByText("Answers sent right to your Slack #channels");
      cy.findByText("metabase@metabase.com").should("not.exist");

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
        USERS.nocollection.first_name + " " + USERS.nocollection.last_name,
      ).click();
      cy.findByText("Add").click();

      cy.findByText(USERS.nocollection.username);
      cy.findByText("A group is only as good as its members.").should(
        "not.exist",
      );

      // Adds self as member

      cy.findByText("Add members").click();
      cy.get("input").type("T");
      cy.findByText(
        USERS.admin.first_name + " " + USERS.admin.last_name,
      ).click();
      cy.findByText("Add").click();

      cy.findByText(USERS.admin.username);

      // Check member count

      // *** Unnecessary click (Issue #12693)
      cy.findAllByText("People")
        .last()
        .click();

      cy.findAllByText("2 other groups").should("have.length", 2);

      cy.findAllByText("Groups")
        .first()
        .click();

      cy.findByText("Marketing");
      cy.get("td")
        .eq("-2")
        .contains("2");
    });

    it("should create new users in different groups", () => {
      cy.findAllByText("People")
        .last()
        .click();

      // Add new user into 2 groups

      cy.findByText("Add someone").click();
      cy.findByLabelText("First name").type(new_user.first_name);
      cy.findByLabelText("Last name").type(new_user.last_name);
      cy.findByLabelText("Email").type(new_user.username);
      cy.findAllByText("Default")
        .last()
        .click();
      cy.findAllByText("collection")
        .last()
        .click();
      cy.findByText("Marketing").click();
      cy.findByText("Create").click();
      cy.findByText("Done").click();

      // Check new user is in those groups

      cy.findByText(new_user.first_name + " " + new_user.last_name);
      cy.findAllByText("2 other groups").should("have.length", 3);

      // *** Unnecessary click (Issue #12693)
      cy.findAllByText("Groups")
        .first()
        .click();
      cy.findAllByText("People")
        .last()
        .click();

      cy.findAllByText("Groups")
        .first()
        .click();
      cy.get("td")
        .eq("-2")
        .contains("3");

      cy.findByText("Marketing").click();

      cy.findByText(new_user.username);
      cy.findByText(USERS.nodata.username).should("not.exist");
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
      signOut();
      signInAsAdmin();
    });

    it("should check table and question names as user", () => {
      // Log out as admin and sign in as user

      signOut();
      signInAsNormalUser();
      cy.visit("/");

      // Check names

      cy.wait(3000).contains("A look at your People table");
      cy.contains("A look at your Orders table");
      cy.contains("A look at your Test Table table").should("not.exist");

      cy.findByText("Browse all items").click();

      cy.findByText("Our analytics");
      cy.findByText("A look at your").should("not.exist");

      cy.get(".hover-parent")
        .eq("2")
        .findByText("Orders, Count");
      cy.findByText("Orders, Count, Grouped by Created At (year)");
      cy.findByText("Test Q Name Change").should("not.exist");
    });

    it("should rename a question and description as admin", () => {
      cy.visit("/");

      cy.findByText("Browse all items").click();

      cy.findByText("All personal collections");
      cy.findByText("A look at your").should("not.exist");

      cy.findByText("Orders, Count, Grouped by Created At (year)").click();

      cy.findByText("Settings");

      cy.get(".Icon-pencil").click();
      cy.findByText("Edit this question").click();
      cy.findByLabelText("Name")
        .clear()
        .type("Test Question");
      cy.findByLabelText("Description").type("Testing question description");
      cy.findByText("Save").click();
    });

    it("should rename a table and add a description as admin", () => {
      cy.visit("/");
      cy.get(".Icon-gear")
        .first()
        .click();
      cy.findByText("Admin").click();

      cy.findByText("Getting set up");
      cy.findByText(USERS.admin.first_name).should("not.exist");

      cy.findByText("Data Model").click();
      cy.findByText("Orders").click();
      cy.get(".TableEditor-table-name")
        .wait(500)
        .clear()
        .wait(500)
        .type("Test Table");

      cy.get("[value='This is a confirmed order for a product from a user.']")
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
          cy.get(".Icon-gear").click();
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

      cy.get(".Icon-gear")
        .eq(1)
        .click();
      cy.findByText("Exit admin").click();

      // Checking table name

      cy.contains("A look at your Test Table table");
      cy.contains("A look at your Reviews table");
      cy.contains("A look at your Orders table").should("not.exist");

      // Navigating to Test Table table

      cy.findByText("Browse Data").click();
      cy.findByText("Sample Dataset").click();

      cy.get(".Icon-info");
      cy.get(".Icon-database").should("not.exist");

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

      cy.get(".Icon-notebook").click({ force: true });

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
          cy.get(".Icon-gear").click();
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

      cy.get(".Icon-notebook").click({ force: true });
      cy.wait(3000)
        .findByText("Filter")
        .click();
      cy.findAllByText("Product ID")
        .last()
        .click();
      cy.get("input")
        .last()
        .type("Awesome Concrete");
      cy.wait(1000)
        .findAllByText("Awesome Concrete Shoes")
        .last()
        .click();
      cy.findByText("Add filter").click();
      cy.findByText("Visualize").click();

      cy.findAllByText("Awesome Concrete Shoes");
      cy.findByText("Mediocre Wooden Bench").should("not.exist");
    });

    it("should hide a table as admin", () => {
      cy.visit("/admin/datamodel/database/1/");

      // Hide table

      cy.findByText("Reviews")
        .find(".Icon-eye_crossed_out")
        .click({ force: true });

      // Check table hidden on home page

      cy.visit("/");

      cy.contains(", " + USERS.admin.first_name);
      cy.contains("A look at your People table");
      cy.contains("A look at your Reviews table").should("not.exist");

      // Check table hidden while browsing data

      cy.visit("/browse/1");

      cy.findByText("Learn about our data");
      cy.findByText("Test Table");
      cy.findByText("Reviews").should("not.exist");

      // Check table hidden in notebook editor

      cy.findByText("Test Table").click();
      cy.get(".Icon-notebook").click({ force: true });

      cy.wait(3000)
        .findByText("Join data")
        .click();

      cy.findAllByText("Test Table");
      cy.findByText("Reviews").should("not.exist");
    });

    it("should see changes to visibility, formatting, and foreign key mapping as user", () => {
      signOut();
      signInAsNormalUser();
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
      cy.get(".Icon-pencil").click();
      cy.findByText("Edit this question").click();

      cy.findByText("Edit question");
      cy.findByText("Testing question description");

      cy.findByText("Cancel").click();

      // Check column names and visiblity

      cy.findByText("Browse Data").click();
      cy.findByText("Sample Dataset").click();
      cy.findByText("Test Table").click();

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
    beforeEach(signInAsNormalUser);

    it("should check current permissions as users", () => {
      // Access to all tables as user
      cy.visit("/");

      cy.contains("A look at your People table");
      cy.contains("A look at your Test Table table");
      cy.findByText("A look at your Review table").should("not.exist");

      // Access to SQl queries as user

      cy.findByText("Ask a question").click();
      cy.findByText("Native query");

      // Cannot see Review table as no collection user
      signOut();
      signIn("nocollection");
      cy.visit("/");

      cy.wait(2000).findByText("Try these x-rays based on your data.");
      cy.contains("A look at your Test Table table");
      cy.contains("A look at your Review table").should("not.exist");

      // Cannot view our analytics as no collection user

      cy.findByText("Browse all items").click();
      cy.findByText("Orders").should("not.exist");
    });

    it("should modify user permissions for data access and SQL queries, both on a database/schema level as well as at a table level as admin", () => {
      // *** Need multible databases to test their permissions.

      signOut();
      signInAsAdmin();
      cy.visit("/");

      cy.get(".Icon-gear").click();
      cy.findByText("Admin").click();
      cy.findByText("Permissions").click();

      // Data access permissions (database/schema)

      // SQL queries permissions (database/schema)

      // Data access permissions (table)

      cy.findByText("View tables").click();

      cy.findByText("Products");
      cy.findByText("SQL Queries").should("not.exist");

      // Turn on data access for all users to Test Table
      cy.get(".Icon-close")
        .eq(6)
        .click();
      cy.findByText("Grant unrestricted access").click();

      cy.findByText("Change access to this database to limited?");

      cy.findByText("Change").click();

      // Turn on data access for Marketing users to Products
      cy.get(".Icon-close")
        .eq(2)
        .click();
      cy.findByText("Grant unrestricted access").click();

      cy.findByText("Are you sure you want to do this?");

      cy.findByText("Change").click();

      cy.get(".Icon-warning");

      cy.findByText("Save Changes").click();

      cy.contains(
        "All Users will be given access to 1 table in Sample Dataset.",
      );
      cy.findByText("Are you sure you want to do this?");

      cy.findByText("Yes").click();

      // SQL queries permissions (table)

      cy.findByText("Data permissions").click();

      cy.get(".Icon-sql")
        .last()
        .click();
      cy.findByText("Revoke access").click();

      cy.findByText("Save Changes").click();

      cy.contains(
        "data will no longer be able to read or write native queries for Sample Dataset.",
      );
      cy.findByText("Yes").click();
    });

    it("should add sub-collection and change its permissions as admin", () => {
      // Adds sub-collection

      signOut();
      signInAsAdmin();
      cy.visit("/collection/root");

      cy.findByText("Our analytics");

      cy.findByText("New collection").click();
      cy.findByLabelText("Name").type("test sub-collection");
      cy.findByLabelText("Description")
        .wait(1)
        .type("very descriptive of test sub-collection");
      cy.get(".Icon-chevrondown").click();
      cy.findAllByText("Our analytics")
        .last()
        .click();

      cy.findByText("Create").click();

      cy.get(".Icon-all");

      // Changes permissions of sub-collection

      cy.findByText("test sub-collection").click();

      cy.findByText("This collection is empty, like a blank canvas");

      cy.get(".Icon-lock").click();

      cy.findByText("Permissions for this collection");

      // Collection can no longer access sub-collection
      cy.wait(1)
        .get(".Icon-check")
        .last()
        .click();
      cy.findByText("Revoke access").click();

      // Marketing now has access to sub-collection
      cy.get(".Icon-close")
        .last()
        .click();
      cy.findByText("Curate collection").click();

      cy.findByText("Save").click();

      cy.findByText("This collection is empty, like a blank canvas");
    });

    it("should modify Collection permissions for top-level collections and sub-collections as admin", () => {
      signOut();
      signInAsAdmin();
      cy.visit("/admin/permissions/databases");

      // Modify permissions for top-level collection

      cy.findByText("Collection permissions").click();
      cy.get(".Icon-close")
        .eq(1)
        .click();
      cy.findByText("View collection").click();
      cy.findByText("Save Changes").click();

      cy.findByText("Save permissions?");

      cy.findByText("Yes").click();

      cy.findByText("View sub-collections").click();

      // Give collection full access to sub-collection
      cy.get(".Icon-close")
        .last()
        .click();
      cy.findByText("Curate collection").click();
      // Revoke Marketing access to sub-collection
      cy.get(".Icon-check")
        .last()
        .click();
      cy.findByText("Revoke access").click();
      // Revoke data access to sub-collection
      cy.get(".Icon-eye").click();
      cy.findByText("Revoke access").click();
      cy.findByText("Save Changes").click();

      cy.findByText("Save permissions?");

      cy.findByText("Yes").click();
      cy.findByText("Collection permissions").click();

      cy.get(".Icon-eye");
    });

    it("should be unable to access tables or questions that have been restricted as user", () => {
      cy.visit("/");

      // Normal user can still see everything

      cy.wait(2000).contains("A look at your Test Table table");
      cy.contains("A look at your Products table");

      // Normal user cannot make an SQL query

      cy.findByText("Ask a question").click();

      cy.findByText("Simple question");
      cy.findByText("Native query").should("not.exist");

      signOut();
      signIn("nocollection");
      cy.visit("/");

      // No collection user sees Test Table and People table

      cy.contains("A look at your Test Table table");
      cy.contains("A look at your People table");
      cy.contains("A look at your Reviews table").should("not.exist");
    });

    it("should be unable to change questions in Our analytics as no collection user", () => {
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

      signOut();
      signInAsNormalUser();
      cy.visit("/question/1");

      // cy.findByText("Product ID");
      // cy.findByText("Quantity").should("not.exist");
    });

    it("should add a sub collection as a user", () => {
      cy.visit("/collection/root");

      cy.wait(3000)
        .findByText("New collection")
        .click();

      cy.findByLabelText("Name").type("test user added sub-collection");
      cy.findByLabelText("Description").type(
        "very descriptive of test user added sub-collection",
      );
      cy.get(".Icon-chevrondown").click();
      cy.findAllByText("Our analytics")
        .last()
        .click();

      cy.findByText("Create").click();

      cy.get(".Icon-all");
    });

    it("should view collections I have access to, but not ones that I don't (even with URL) as user", () => {
      // Check access as normal user

      cy.visit("/collection/root");

      cy.findByText("My personal collection");
      cy.findByText("test sub-collection").click();

      cy.wait(3000).findByText("This collection is empty, like a blank canvas");
      cy.findByText("Sorry, you don’t have permission to see that.").should(
        "not.exist",
      );

      // Check editing abiltiy as no collection user (resetting to what we made it before)

      cy.get(".Icon-pencil");

      cy.findByText("Ask a question").click();
      cy.findByText("Simple question").click();
      cy.findByText("Sample Dataset").click();
      cy.findByText("People").click();
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

      signIn("nocollection");
      cy.visit("/");

      cy.findByText("test sub-collection").should("not.exist");

      cy.visit("/collection/6");

      cy.findByText("Sorry, you don’t have permission to see that.");
      cy.findByText("This collection is empty, like a blank canvas").should(
        "not.exist",
      );
    });

    it("should be unable to access question with URL (if access not permitted)", () => {
      // This test will fail whenever the previous test fails
      signIn("nocollection");

      cy.visit("/question/4");
      cy.contains("sub-collection question").should("not.exist");
      cy.findByText("Sorry, you don’t have permission to see that.");
    });

    it("should deactivate a user admin and subsequently user should be unable to login", () => {
      // Admin deactiviates user

      signOut();
      signInAsAdmin();
      cy.visit("/admin/settings/setup");

      cy.findByText("People").click();
      cy.get(".Icon-ellipsis")
        .eq(-2)
        .click();
      cy.findByText("Deactivate user").click();

      cy.findByText("Robert Tableton won't be able to log in anymore.");

      cy.findByText("Deactivate").click();

      cy.findByText(
        USERS.normal.first_name + " " + USERS.normal.last_name,
      ).should("not.exist");
      cy.findByText(new_user.first_name + " " + new_user.last_name);

      // User tries to log in

      signOut();
      cy.visit("/");
      cy.findByLabelText("Email address").type(USERS.normal.username);
      cy.findByLabelText("Password").type(USERS.normal.password);
      cy.findByText("Sign in").click();

      cy.contains(USERS.normal.first_name).should("not.exist");
      cy.findByText("Our Analytics").should("not.exist");
      cy.findByText("Failed");
      cy.contains("Password : did not match stored password");
    });
  });
});
