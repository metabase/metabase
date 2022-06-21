import {
  popover,
  restore,
  startNewQuestion,
  visitQuestion,
} from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

const { normal } = USERS;

describe("smoketest > admin_setup", () => {
  before(restore);

  describe("permission changes reflected", () => {
    beforeEach(cy.signInAsNormalUser);

    it("should check current permissions as users", () => {
      // Access to all tables as user
      cy.visit("/");

      cy.contains("Test Table");
      cy.findByText("Reviews").should("not.exist");

      // Access to SQl queries as user

      cy.findByText("New").click();
      cy.findByText("SQL query");

      // Cannot see Review table as no collection user
      cy.signOut();
      cy.signIn("nocollection");
      cy.visit("/");

      cy.wait(2000).findByText("Here are some popular tables");
      cy.contains("Test Table");
      cy.contains("Reviews").should("not.exist");

      // Cannot view our analytics as no collection user

      cy.findByText("Our analytics").click();
      cy.findByText("Orders").should("not.exist");
    });

    it("should modify user permissions for data access and SQL queries, both on a database/schema level as well as at a table level as admin", () => {
      cy.signOut();
      cy.signInAsAdmin();

      cy.request("POST", "/api/permissions/group", {
        name: "Marketing",
      });

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

      cy.findByText("Data").click();

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

      cy.findByText("Collection").click();
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
      cy.findByText("Collection").click();

      cy.icon("eye");
    });

    it("should be unable to access tables or questions that have been restricted as user", () => {
      cy.visit("/");

      // Normal user can still see everything

      cy.wait(2000).contains("Test Table");

      // Normal user cannot make an SQL query

      startNewQuestion();

      cy.signOut();
      cy.signIn("nocollection");
      cy.visit("/");

      // No collection user sees Test Table and People table

      cy.contains("Test Table");
      cy.contains("Reviews").should("not.exist");
    });

    it.skip("should be unable to change questions in Our analytics as no collection user", () => {
      cy.findByText("Our analytics").click();

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
      visitQuestion(1);

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

      startNewQuestion();
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

      visitQuestion(4);
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
