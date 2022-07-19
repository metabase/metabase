import {
  restore,
  popover,
  modal,
  navigationSidebar,
  openNewCollectionItemFlowFor,
  getCollectionActions,
  openCollectionMenu,
} from "__support__/e2e/helpers";

import { USERS } from "__support__/e2e/cypress_data";

const adminPersonalCollectionId = 1;

describe("personal collections", () => {
  beforeEach(() => {
    restore();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should be able to view their own as well as other users' personal collections (including other admins)", () => {
      // Turn normal user into another admin
      cy.request("PUT", "/api/user/2", {
        is_superuser: true,
      });

      cy.visit("/collection/root");
      cy.findByText("Your personal collection");
      navigationSidebar().within(() => {
        cy.icon("ellipsis").click();
      });
      popover().findByText("Other users' personal collections").click();
      cy.location("pathname").should("eq", "/collection/users");
      cy.findByText(/All personal collections/i);
      Object.values(USERS).forEach(user => {
        const FULL_NAME = `${user.first_name} ${user.last_name}`;
        cy.findByText(FULL_NAME);
      });
    });

    it("cannot edit details for personal collections nor change permissions for personal collections or sub-collections (metabase#8406)", () => {
      // Let's use the API to create a sub-collection "Foo" in admin's personal collection
      cy.request("POST", "/api/collection", {
        name: "Foo",
        color: "#ff9a9a",
        parent_id: adminPersonalCollectionId,
      });

      // Go to admin's personal collection
      cy.visit("/collection/root");
      cy.findByText("Your personal collection").click();

      getCollectionActions().within(() => {
        cy.icon("ellipsis").should("not.exist");
      });

      // This leads to an infinite loop and a timeout in the CI
      // Please see: https://github.com/metabase/metabase/issues/21026#issuecomment-1094114700

      // Check that it's not possible to open permissions modal via URL for personal collection
      // cy.location().then(location => {
      //   cy.visit(`${location}/permissions`);
      //   cy.get(".Modal").should("not.exist");
      //   cy.url().should("eq", String(location));
      // });

      // Go to the newly created sub-collection "Foo"
      navigationSidebar().findByText("Foo").click();

      // It should be possible to edit sub-collections' details, but not its permissions
      cy.findByDisplayValue("Foo").should("be.enabled");
      openCollectionMenu();
      popover().within(() => {
        cy.findByText("Edit permissions").should("not.exist");
      });

      // Check that it's not possible to open permissions modal via URL for personal collection child
      // cy.location().then(location => {
      //   cy.visit(`${location}/permissions`);
      //   cy.get(".Modal").should("not.exist");
      //   cy.url().should("eq", String(location));
      // });

      // Go to random user's personal collection
      cy.visit("/collection/5");

      getCollectionActions().within(() => {
        cy.icon("ellipsis").should("not.exist");
      });
    });

    it.skip("should be able view other users' personal sub-collections (metabase#15339)", () => {
      cy.visit("/collection/5");
      openNewCollectionItemFlowFor("collection");
      cy.findByLabelText("Name").type("Foo");
      cy.button("Create").click();
      // This repro could possibly change depending on the design decision for this feature implementation
      navigationSidebar().findByText("Foo");
    });
  });

  describe("all users", () => {
    Object.keys(USERS).forEach(user => {
      describe(`${user} user`, () => {
        beforeEach(() => {
          cy.signIn(user);

          cy.visit("/collection/root");
          cy.findByText("Your personal collection").click();

          // Create initial collection inside the personal collection and navigate to it
          addNewCollection("Foo");
          navigationSidebar().as("sidebar").findByText("Foo").click();
        });

        it("should be able to edit collection(s) inside personal collection", () => {
          // Create new collection inside previously added collection
          addNewCollection("Bar");
          cy.get("@sidebar").findByText("Bar").click();
          cy.findByPlaceholderText("Add title").type("1").blur();
          cy.findByPlaceholderText("Add description").type("ex-bar").blur();

          cy.get("@sidebar").findByText("Foo").click();
          cy.get("@sidebar").findByText("Bar1");

          cy.log(
            "should be able to archive collection(s) inside personal collection (metabase#15343)",
          );

          openCollectionMenu();
          popover().within(() => cy.findByText("Archive").click());
          modal().findByRole("button", { name: "Archive" }).click();
          cy.findByText("Archived collection");
          cy.get("@sidebar").findByText("Foo").should("not.exist");
        });
      });
    });
  });
});

function addNewCollection(name) {
  openNewCollectionItemFlowFor("collection");
  cy.findByLabelText("Name").type(name, { delay: 0 });
  cy.button("Create").click();
}
