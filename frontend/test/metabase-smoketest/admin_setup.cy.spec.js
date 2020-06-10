import {
  restore,
  signInAsAdmin,
  USERS,
  signOut,
  signInAsNormalUser,
} from "__support__/cypress";
import { createMasonryCellPositioner } from "react-virtualized";

const new_user = {
  first_name: "Barb",
  last_name: "Tabley",
  username: "new@metabase.com",
};

describe("smoketest > admin_setup", () => {
  before(restore);
  before(signInAsAdmin);

  it("should have admin changes reflected with the user account", () => {
    cy.visit("/");

    // *******************************
    // *** Admin - Successful Setup **
    // ********************************

    // =================
    // should add a new database
    // *** I don't have any faux databases to hook up to. Are there some in the system already?
    // *** Should eventually include BigQuery, Druid, Google Analytics, H2, MongoDB, MySQL/Maria DB, PostgreSQL, Presto, Amazon Redshift, Snowflake, Spark SQL, SQLite, SQL Server
    // =================

    // Navigate to page

    cy.get(".Icon-gear")
      .first()
      .click();
    cy.findByText("Admin").click();

    cy.contains("Metabase Admin");
    cy.contains("dashboard").should("not.exist");

    cy.findByText("Databases").click();

    cy.contains("Sample Dataset");
    cy.contains("Updates").should("not.exist");

    cy.findByText("Add database").click();

    cy.contains(
      "Automatically run queries when doing simple filtering and summarizing",
    );

    // Adds new database

    // cy.findByText("H2").click();
    // cy.findByText("PostgreSQL").click();
    // cy.findByLabelText("Name").type("Postgre Database");
    // cy.findByLabelText("Host").type("");
    // cy.findByLabelText("Port").type("");
    // cy.findByLabelText("Database name").type("");
    // cy.findByLabelText("Database username").type("");
    // cy.findByLabelText("Database password").type("");
    // // *** check that toggles are correct
    // cy.findByLabelText("Additional JDBC connection string options").type("");
    // cy.findByText("Save").click();

    // =================
    // should setup email (maybe using something like maildev)
    // =================

    cy.findByText("Settings").click();
    cy.findByText("Email").click();

    cy.contains("Email address you want to use as the sender of Metabase.");
    cy.contains("Sample Database").should("not.exist");

    // Email info
    // cy.findByLabelText("SMTP HOST").type("smtp.gmail.com");
    // cy.findByLabelText("SMTP PORT").type("465");
    // cy.findByText("SSL").click();
    // cy.findByLabelText("SMTP USERNAME").type(""); // *** enter email here
    // cy.findByLabelText("SMTP PASSWORD").type(""); // *** enter password here
    // cy.findByLabelText("FROM ADDRESS").type("metabase@metabase.com");
    // cy.findByText("Save changes").click();

    // =================
    // should setup Slack
    // =================

    cy.findByText("Slack").click();

    cy.contains("Answers sent right to your Slack #channels");
    cy.contains("metabase@metabase.com").should("not.exist");

    cy.contains("Create a Slack Bot User for MetaBot");
    cy.contains(
      'Once you\'re there, give it a name and click "Add bot integration". Then copy and paste the Bot API Token into the field below. Once you are done, create a "metabase_files" channel in Slack. Metabase needs this to upload graphs.',
    );

    // =================
    // should create new groups
    // =================

    cy.findByText("People").click();

    cy.contains("2 other groups");

    cy.findAllByText("Groups")
      .first()
      .click();

    cy.contains(
      "You can use groups to control your users' access to your data.",
    );
    cy.contains("All Users");
    cy.contains("Slack").should("not.exist");

    // Creates new group

    cy.findByText("Create a group").click();
    cy.get("input").type("Marketing");
    cy.findByText("Add").click();
    cy.findByText("Marketing").click();

    cy.contains("A group is only as good as its members.");

    // Adds user as member

    cy.findByText("Add members").click();
    cy.get("input").type("T");
    cy.findByText(
      USERS.normal.first_name + " " + USERS.normal.last_name,
    ).click();
    cy.findByText("Add").click();

    cy.contains(USERS.normal.username);
    cy.contains("A group is only as good as its members.").should("not.exist");

    // Adds self as member

    cy.findByText("Add members").click();
    cy.get("input").type("T");
    cy.findByText(USERS.admin.first_name + " " + USERS.admin.last_name).click();
    cy.findByText("Add").click();

    cy.contains(USERS.admin.username);

    // Check member count

    cy.findAllByText("People") // *** Going to People and then to Groups should be unnecessary
      .last()
      .click();

    cy.contains("3 other groups");

    cy.findAllByText("Groups")
      .first()
      .click();

    cy.contains("Marketing");
    cy.get("td")
      .eq("-2")
      .contains("2");

    // =================
    // should create new users in different groups
    // =================

    cy.findAllByText("People")
      .last()
      .click();

    // Add new user into 2 groups

    cy.findByText("Add someone").click();
    cy.findByLabelText("First name").type(new_user.first_name);
    cy.findByLabelText("Last name").type(new_user.last_name);
    cy.findByLabelText("Email").type(new_user.username);
    cy.get(".ModalBody")
      .find(".Icon-chevrondown")
      .first()
      .click();
    cy.findByText("English").click();
    cy.contains("Turkish").should("not.exist");
    cy.get(".ModalBody") // *** I should be able to select using $ cy.findByText("Default"), but cypress says there are multiple instances
      .find(".Icon-chevrondown")
      .last()
      .click();
    cy.findAllByText("collection") // *** I should be able to select collection without "All" because there's only one instance of "collection"
      .last()
      .click();
    cy.findByText("Marketing").click();
    cy.findByText("Create").click();
    cy.findByText("Done").click();

    // Check new user is in those groups

    cy.contains(new_user.first_name + " " + new_user.last_name);
    cy.get("td")
      .eq("-3")
      .contains("2 other groups");

    cy.findAllByText("Groups") // *** These 6 lines of code should be unnecessary.
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

    cy.contains(new_user.username);
    cy.contains(USERS.nodata.username).should("not.exist");

    // =================
    // should set up custom maps
    // =================

    cy.findByText("Settings").click();
    cy.findByText("Maps").click();

    cy.contains("Custom Maps");
    cy.contains("Groups").should("not.exist");

    // cy.findByText("Add a map").click();
    // cy.get("input")
    //   .first()
    //   .type("Test Map");
    // cy.get("input")
    //   .last()
    //   .type("") // *** type GeoJSON url here
    // cy.findAllByText("Select...")
    //   .first()
    //   .click();
    // cy.findByText("");
    // cy.findAllByText("Select...")
    //   .last()
    //   .click();
    // cy.findByText("");
    // cy.findByText("Add map").click();

    // ********************************
    // * Data Model Changes Reflected *
    // *********************************

    // Log out as admin and sign in as user

    signOut();
    signInAsNormalUser();
    cy.visit("/");

    // =================
    // should check table and question names as user
    // =================

    cy.contains("A look at your People table");
    cy.contains("A look at your Orders table");
    cy.contains("A look at your Test Table table").should("not.exist");

    cy.findByText("Browse all items").click();

    cy.contains("Our analytics");
    cy.contains("A look at your").should("not.exist");

    cy.get(".hover-parent")
      .eq("2")
      .contains("Orders, Count");
    cy.contains("Orders, Count, Grouped by Created At (year)");
    cy.contains("Test Q Name Change").should("not.exist");

    // Log out as user and sign in as admin

    signOut();
    signInAsAdmin();
    cy.visit("/");

    // =================
    // should rename a question and description as admin
    // =================

    cy.findByText("Browse all items").click();

    cy.contains("All personal collections");
    cy.contains("A look at your").should("not.exist");

    cy.findByText("Orders, Count, Grouped by Created At (year)").click();

    cy.contains("Settings");

    cy.get(".Icon-pencil").click();
    cy.findByText("Edit this question").click();
    cy.findByLabelText("Name")
      .clear()
      .type("Test Question");
    cy.findByLabelText("Description").type("Testing question description");
    cy.findByText("Save").click();

    // =================
    // should rename a table and add a description as admin
    // =================

    cy.get(".Icon-gear")
      .first()
      .click();
    cy.findByText("Admin").click();

    cy.contains("Getting set up");
    cy.contains(USERS.admin.first_name).should("not.exist");

    cy.findByText("Data Model").click();
    cy.findByText("Orders").click();
    cy.get(".TableEditor-table-name")
      .clear()
      .type("Test Table");

    cy.get("input")
      .eq(2)
      .clear()
      .type("Testing table description");

    // =================
    // should change a column name, visibility, and formatting as admin
    // =================

    // Changing column name from Discount to Sale

    cy.get("input")
      .eq(5)
      .clear()
      .type("Sale");

    // Changing visibility of Created At column

    cy.findAllByText("Everywhere")
      .first()
      .click();
    cy.findByText("Do not include").click({ force: true });

    // Changing column formatting to display USD instead of $

    cy.get(".Icon-gear")
      .eq(-2)
      .click();

    cy.contains("Total – Field Settings");
    cy.contains("Columns").should("not.exist");

    cy.findByText("Formatting").click();

    cy.contains("Show a mini bar chart");
    cy.contains("Everywhere").should("not.exist");

    cy.findByText("Normal").click();
    cy.findByText("Currency").click({ force: true });
    cy.findByText("Code (USD)").click();
    cy.findByText("In every table cell").click();

    cy.contains("Saved");

    // =================
    // Checking that changes to column name, visibility, and formatting are reflected in the notebook editor as admin
    // =================

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

    cy.contains("Discount").should("not.exist");
    cy.contains("Sale");

    cy.contains("Created At").should("not.exist");

    cy.contains("Total ($)").should("not.exist");
    cy.contains("USD");

    // Check column name and visibility in notebook editor

    cy.get(".Icon-notebook").click();

    cy.contains("Custom column");
    cy.contains("Orders").should("not.exist");

    cy.findByText("Filter").click();
    cy.contains("Sale");
    cy.contains("Discount").should("not.exist");

    cy.contains("Created At").should("not.exist");

    // =================
    // should configure a foreign key to show the name as admin
    // =================

    cy.visit("/admin/datamodel/database/1/table/2");

    // Configure Key

    cy.contains("Metrics");
    cy.get(".Icon-gear")
      .eq(6)
      .click();
    cy.findByText("Use original value").click();
    cy.findByText("Use foreign key").click();
    cy.findByText("Title").click();

    cy.contains(
      "You might want to update the field name to make sure it still makes sense based on your remapping choices.",
    );

    // Check key config in table display
    // *** I went the fast way here instead of user journey

    cy.visit("/browse/1");
    cy.findByText("Test Table").click();

    cy.contains("Product ID");
    cy.contains("Awesome Concrete Shoes");
    cy.contains("Mediocre Wooden Bench");
    cy.get(".Table-ID")
      .eq("1")
      .contains("14")
      .should("not.exist");

    // Check key config in notebook editor

    cy.get(".Icon-notebook").click();
    cy.findByText("Filter").click();
    cy.findAllByText("Product ID")
      .last()
      .click();
    cy.get("input")
      .last()
      // .type("Awesome Concrete Shoes"); // *** should accept string, but only accepts ints
      .type("14"); // *** This pulls up title with the ID you've typed in
    cy.findByText("Add filter").click();
    cy.findByText("Visualize").click();

    cy.contains("Awesome Concrete Shoes");
    cy.contains("Mediocre Wooden Bench").should("not.exist");

    // =================
    // should hide a table as admin
    // =================

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

    cy.contains("Learn about our data");
    cy.contains("Test Table");
    cy.contains("Reviews").should("not.exist");

    // Check table hidden in notebook editor

    cy.findByText("Test Table").click();
    cy.get(".Icon-notebook").click();

    cy.findByText("Join data").click();

    cy.contains("Test Table");
    cy.contains("Reviews").should("not.exist");

    // =================
    // should see changes to visibility, formatting, and foreign key mapping as user
    // =================

    signOut();
    signInAsNormalUser();
    cy.visit("/");

    // Check table names and visibility

    cy.contains("A look at your People table");
    cy.contains("A look at your Test Table table");
    cy.contains("Reviews").should("not.exist");

    // Check question names and descriptions

    cy.findByText("Browse all items").click();

    cy.contains("Orders, Count");
    cy.contains("Orders, Count, Grouped by Created At (year)").should(
      "not.exist",
    );

    cy.findByText("Test Question").click();
    cy.get(".Icon-pencil").click();
    cy.findByText("Edit this question").click();

    cy.contains("Edit question");
    cy.contains("Testing question description");

    cy.findByText("Cancel").click();

    // Check column names and visiblity

    cy.findByText("Browse Data").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Test Table").click();

    cy.contains("Visualization");
    cy.contains("Discount").should("not.exist");
    cy.contains("Sale");
    cy.contains("Created At").should("not.exist");

    // Check column formatting

    cy.contains("USD");

    // Check column foreign key mapping

    cy.contains("Awesome Concrete Shoes");
    cy.contains("Mediocre Wooden Bench");
    cy.get(".Table-ID")
      .eq("1")
      .contains("14")
      .should("not.exist");

    // *********************************
    // ** Permission Changes Reflected *
    // *********************************

    // signOut();
    // signInAsNormalUser();
    // cy.visit("/");

    // =================
    // should check current permissions as user
    // =================

    // =================
    // should modify user permissions for data access and SQL queries, both on a database/schema level as well as at a table level as admin
    // *** Need multible databases to test their permissions.
    // *** User in Marketing
    // =================

    signOut();
    signInAsAdmin();
    cy.visit("/");

    cy.get(".Icon-gear").click();
    cy.findByText("Admin").click();
    cy.findByText("Permissions").click();

    // data access permissions (database/schema)

    // SQL queries permissions (database/schema)

    // data access permissions (table)

    cy.findByText("View tables").click();

    cy.contains("Products");
    cy.contains("SQL Queries").should("not.exist");

    cy.get(".Icon-close") // Turn on data access for all users to Test Table
      .eq(6)
      .click();
    cy.findByText("Grant unrestricted access").click();

    cy.contains("Change access to this database to limited?");

    cy.findByText("Change").click();

    cy.get(".Icon-close") // Turn on data access for Marketing users to Products
      .eq(2)
      .click();
    cy.findByText("Grant unrestricted access").click();

    cy.contains("Are you sure you want to do this?");

    cy.findByText("Change").click();

    cy.get(".Icon-warning");

    cy.findByText("Save Changes").click(); // *** inconcsistent formatting. Everywhere else would have a lowercase "c"

    cy.contains("All Users will be given access to 1 table in Sample Dataset.");
    cy.contains("Are you sure you want to do this?");

    cy.findByText("Yes").click();

    // SQL queries permissions (table)

    cy.findByText("Data permissions").click();

    cy.get(".Icon-sql")
      .last()
      .click();
    cy.findByText("Revoke access").click();

    cy.findByText("Save Changes").click();

    // =================
    // should modify Collection permissions for top-level collections and sub-collections as admin
    // *** Sub-collections need to exist before you can test them
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
