import { restore, popover, modal, sidebar } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

describe("personal collections", () => {
  beforeEach(() => {
    restore();
    cy.server();
  });

  describe("admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      // Turn normal user into another admin
      cy.request("PUT", "/api/user/2", {
        is_superuser: true,
      });
    });

    it("should be able to view their own as well as other users' personal collections (including other admins)", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection");
      cy.findByText("Other users' personal collections").click();
      cy.location("pathname").should("eq", "/collection/users");
      cy.findByText(/All personal collections/i);
      Object.values(USERS).forEach(user => {
        const FULL_NAME = `${user.first_name} ${user.last_name}`;
        cy.findByText(FULL_NAME);
      });
    });

    it("shouldn't be able to change permission levels or edit personal collections", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection").click();
      cy.icon("new_folder");
      cy.icon("lock").should("not.exist");
      cy.icon("pencil").should("not.exist");
      // Visit random user's personal collection
      cy.visit("/collection/5");
      cy.icon("new_folder");
      cy.icon("lock").should("not.exist");
      cy.icon("pencil").should("not.exist");
    });

    it("shouldn't be able to change permission levels for sub-collections in personal collections (metabase#8406)", () => {
      cy.visit("/collection/root");
      cy.findByText("Your personal collection").click();
      // Create new collection inside admin's personal collection and navigate to it
      addNewCollection("Foo");
      sidebar()
        .findByText("Foo")
        .click();
      cy.icon("new_folder");
      cy.icon("pencil");
      cy.icon("lock").should("not.exist");

      // Check can't open permissions modal via URL for personal collection
      cy.findByText("Your personal collection").click();
      cy.location().then(location => {
        cy.visit(`${location}/permissions`);
        cy.get(".Modal").should("not.exist");
        cy.url().should("eq", String(location));

        // Check can't open permissions modal via URL for personal collection child
        sidebar()
          .findByText("Foo")
          .click();
        cy.location().then(location => {
          cy.visit(`${location}/permissions`);
          cy.get(".Modal").should("not.exist");
          cy.url().should("eq", String(location));
        });
      });
    });

    it.skip("should be able view other users' personal sub-collections (metabase#15339)", () => {
      cy.visit("/collection/5");
      cy.icon("new_folder").click();
      cy.findByLabelText("Name").type("Foo");
      cy.findByText("Create").click();
      // This repro could possibly change depending on the design decision for this feature implementation
      sidebar().findByText("Foo");
    });
  });

  describe("all users", () => {
    Object.keys(USERS).forEach(user => {
      describe(`${user} user`, () => {
        beforeEach(() => {
          cy.signIn(user);
          cy.visit("/collection/root");
          cy.findByText("Your personal collection").click();
          // Create initial collection inside the personal collection and navigate inside it
          addNewCollection("Foo");
          sidebar()
            .as("sidebar")
            .findByText("Foo")
            .click();
        });

        it("should be able to edit collection(s) inside personal collection", () => {
          // Create new collection inside previously added collection
          addNewCollection("Bar");
          cy.get("@sidebar")
            .findByText("Bar")
            .click();
          cy.icon("pencil").click();
          /**
           * We're testing a few things here:
           *  1. editing collection's title
           *  2. editing collection's description and
           *  3. moving that collection within personal collection
           */
          cy.findByText("Edit this collection").click();
          modal().within(() => {
            cy.findByLabelText("Name") /* [1] */
              .click()
              .type("1");

            cy.findByLabelText("Description") /* [2] */
              .click()
              .type("ex-bar");
            cy.get(".AdminSelect").click();
          });
          popover()
            .findByText("My personal collection") /* [3] */
            .click();
          cy.button("Update").click();
          // Clicking on "Foo" would've closed it and would hide its sub-collections (if there were any).
          // By doing this, we're making sure "Bar" lives at the same level as "Foo"
          cy.get("@sidebar")
            .findByText("Foo")
            .click();
          cy.get("@sidebar").findByText("Bar1");
        });

        it("should be able to archive collection(s) inside personal collection (metabase#15343)", () => {
          cy.icon("pencil").click();
          cy.findByText("Archive this collection").click();
          modal()
            .findByRole("button", { name: "Archive" })
            .click();
          cy.findByText("Archived collection");
          cy.get("@sidebar")
            .findByText("Foo")
            .should("not.exist");
        });
      });
    });
  });
});

function addNewCollection(name) {
  cy.icon("new_folder").click();
  cy.findByLabelText("Name").type(name);
  cy.findByText("Create").click();
}
