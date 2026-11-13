const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";

describe("personal collections", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should be able to view their own as well as other users' personal collections (including other admins)", () => {
      // Turn normal user into another admin
      cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
        is_superuser: true,
      });

      cy.visit("/collection/root");
      cy.findAllByRole("tree")
        .contains("Your personal collection")
        .should("be.visible");
      H.navigationSidebar()
        .findByLabelText("Other users' personal collections")
        .click();
      cy.location("pathname").should("eq", "/collection/users");
      cy.findByTestId("browsercrumbs").findByText(/All personal collections/i);
      Object.values(USERS).forEach((user) => {
        const FULL_NAME = `${user.first_name} ${user.last_name}`;
        cy.findByText(FULL_NAME);
      });
    });
  });

  describe("admin and non-admin users", () => {
    // The test acts only inside the user's own personal collection, where group
    // collection permissions don't apply; nocollection has the most restricted UI
    (["admin", "nocollection"] as const).forEach((user) => {
      describe(`${user} user`, () => {
        beforeEach(() => {
          cy.signIn(user);

          cy.visit("/collection/root");
          H.navigationSidebar().findByText("Your personal collection").click();

          // Create initial collection inside the personal collection and navigate to it
          addNewCollection("Foo");
          H.navigationSidebar().as("sidebar").findByText("Foo").click();
        });

        it("should be able to edit and trash collection(s) inside personal collection (metabase#15343)", () => {
          cy.intercept("PUT", "/api/collection/*").as("updateCollection");

          // Create new collection inside previously added collection
          addNewCollection("Bar");
          cy.get("@sidebar").findByText("Bar").click();
          cy.findByPlaceholderText("Add title").type("1").blur();
          cy.wait("@updateCollection")
            .its("response.statusCode")
            .should("eq", 200);
          cy.findByPlaceholderText("Add description").type("ex-bar").blur();
          cy.wait("@updateCollection")
            .its("response.statusCode")
            .should("eq", 200);

          cy.findByTestId("collection-name-heading").should(
            "have.value",
            "Bar1",
          );
          cy.findByTestId("collection-caption")
            .findByText("ex-bar")
            .should("be.visible");

          cy.get("@sidebar").findByText("Foo").click();
          cy.get("@sidebar").findByText("Bar1");

          cy.log(
            "should be able to archive collection(s) inside personal collection (metabase#15343)",
          );

          H.openCollectionMenu();
          H.popover().within(() => {
            cy.findByText("Move to trash").should("be.visible");
            // Personal sub-collections have no permissions of their own (metabase#8406)
            cy.findByText("Edit permissions").should("not.exist");
            cy.findByText("Move to trash").click();
          });
          H.modal().button("Move to trash").click();
          cy.findByTestId("toast-undo").should("contain", "Trashed collection");
          cy.get("@sidebar").findByText("Foo").should("not.exist");
        });
      });
    });
  });
});

function addNewCollection(name: string) {
  H.startNewCollectionFromSidebar();
  cy.findByPlaceholderText("My new fantastic collection").type(name, {
    delay: 0,
  });

  cy.findByTestId("new-collection-modal").button("Create").click();
}
