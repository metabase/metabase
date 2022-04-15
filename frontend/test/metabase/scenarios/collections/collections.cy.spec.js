import _ from "underscore";
import {
  restore,
  modal,
  popover,
  openOrdersTable,
  navigationSidebar,
  closeNavigationSidebar,
  openNavigationSidebar,
  getCollectionIdFromSlug,
  startNewQuestion,
} from "__support__/e2e/cypress";
import { displaySidebarChildOf } from "./helpers/e2e-collections-sidebar.js";
import { USERS, USER_GROUPS } from "__support__/e2e/cypress_data";

const { nocollection } = USERS;
const { DATA_GROUP } = USER_GROUPS;

describe("scenarios > collection defaults", () => {
  describe("sidebar behavior", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should navigate effortlessly through collections tree", () => {
      visitRootCollection();

      navigationSidebar().within(() => {
        cy.log(
          "should allow a user to expand a collection without navigating to it",
        );

        // 1. click on the chevron to expand the sub collection
        displaySidebarChildOf("First collection");
        // 2. I should see the nested collection name
        cy.findByText("Second collection");
        cy.findByText("Third collection").should("not.exist");
        // 3. The url should still be /collection/root to test that we haven't navigated away
        cy.location("pathname").should("eq", "/collection/root");

        cy.log(
          "should expand/collapse collection tree by clicking on parent collection name (metabase#17339)",
        );

        // 1. Clicking on the collection name for the first time should navigate to that collection and expand its children
        cy.findByText("Second collection").click();
        cy.findByText("Third collection");

        // 2. Click on that same collection for the second time should collapse its children
        cy.findByText("Second collection").click();
        cy.findByText("Third collection").should("not.exist");

        // 3. However, clicking on previously opened collection will not close it immediately
        cy.findByText("First collection").click();
        cy.findByText("Second collection");
        // 4. We need to click on it again to close it
        cy.findByText("First collection").click();
        cy.findByText("Second collection").should("not.exist");
        cy.findByText("Third collection").should("not.exist");
      });

      cy.log(
        "navigating directly to a collection should expand it and show its children",
      );

      getCollectionIdFromSlug("second_collection", id => {
        visitCollection(id);
      });

      navigationSidebar().within(() => {
        cy.findByText("Second collection");
        cy.findByText("Third collection");

        // Collections without sub-collections shouldn't have chevron icon (metabase#14753)
        ensureCollectionHasNoChildren("Third collection");
        ensureCollectionHasNoChildren("Your personal collection");
      });
    });

    it("should correctly display deep nested collections with long names", () => {
      getCollectionIdFromSlug("third_collection", THIRD_COLLECTION_ID => {
        cy.log("Create two more nested collections");

        ["Fourth collection", "Fifth collection with a very long name"].forEach(
          (collection, index) => {
            cy.request("POST", "/api/collection", {
              name: collection,
              parent_id: THIRD_COLLECTION_ID + index,
              color: "#509ee3",
            });
          },
        );

        visitCollection(THIRD_COLLECTION_ID);
      });

      // 1. Expand so that deeply nested collection is showing
      displaySidebarChildOf("Fourth collection");

      // 2. Ensure we show the helpful tooltip with the full (long) collection name
      cy.findByText("Fifth collection with a very long name").realHover();
      popover().contains("Fifth collection with a very long name");
    });
  });

  describe("Collection related issues reproductions", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    describe("nested collections with revoked parent access", () => {
      const { first_name, last_name } = nocollection;
      const revokedUsersPersonalCollectionName = `${first_name} ${last_name}'s Personal Collection`;

      beforeEach(() => {
        // Create Parent collection within `Our analytics`
        cy.request("POST", "/api/collection", {
          name: "Parent",
          color: "#509EE3",
          parent_id: null,
        }).then(({ body: { id: PARENT_COLLECTION_ID } }) => {
          // Create Child collection within Parent collection
          cy.request("POST", "/api/collection", {
            name: "Child",
            color: "#509EE3",
            parent_id: PARENT_COLLECTION_ID,
          }).then(({ body: { id: CHILD_COLLECTION_ID } }) => {
            // Fetch collection permission graph
            cy.request("GET", "/api/collection/graph").then(
              ({ body: { groups, revision } }) => {
                // Give `Data` group permission to "curate" Child collection only
                // Access to everything else is revoked by default - that's why we chose `Data` group
                groups[DATA_GROUP][CHILD_COLLECTION_ID] = "write";

                // We're chaining these 2 requestes in order to match shema (passing it from GET to PUT)
                // Similar to what we did in `sandboxes.cy.spec.js` with the permission graph
                cy.request("PUT", "/api/collection/graph", {
                  // Pass previously mutated `groups` object
                  groups,
                  revision,
                });
              },
            );
          });
        });

        cy.signOut();
        cy.signIn("nocollection");
      });

      it("should not render collections in items list if user doesn't have collection access (metabase#16555)", () => {
        cy.visit("/collection/root");
        // Since this user doesn't have access rights to the root collection, it should render empty
        cy.findByTestId("collection-empty-state");
      });

      it("should see a child collection in a sidebar even with revoked access to its parent (metabase#14114)", () => {
        cy.visit("/");

        navigationSidebar().within(() => {
          cy.findByText("Our analytics").click();
        });

        navigationSidebar().within(() => {
          cy.findByText("Our analytics");
          cy.findByText("Child");
          cy.findByText("Parent").should("not.exist");
          cy.findByText("Your personal collection");
        });
      });

      it.skip("should be able to choose a child collection when saving a question (metabase#14052)", () => {
        openOrdersTable();
        cy.findByText("Save").click();
        // Click to choose which collection should this question be saved to
        cy.findByText(revokedUsersPersonalCollectionName).click();
        popover().within(() => {
          cy.findByText(/Our analytics/i);
          cy.findByText(/My personal collection/i);
          cy.findByText("Parent").should("not.exist");
          cy.log("Reported failing from v0.34.3");
          cy.findByText("Child");
        });
      });
    });

    it("sub-collection should be available in save and move modals (#14122)", () => {
      const COLLECTION = "14122C";
      // Create Parent collection within `Our analytics`
      cy.request("POST", "/api/collection", {
        name: COLLECTION,
        color: "#509EE3",
        parent_id: 1,
      });
      cy.visit("/collection/root");
      cy.findByRole("tree").as("sidebar");

      displaySidebarChildOf("Your personal collection");
      cy.findByText(COLLECTION);
      cy.get("@sidebar")
        .contains("Our analytics")
        .click();

      openEllipsisMenuFor("Orders");
      popover().within(() => {
        cy.findByText("Move").click();
      });

      modal().within(() => {
        cy.findByText("My personal collection")
          .parent()
          .find(".Icon-chevronright")
          .click();

        cy.findByText(COLLECTION).click();
        cy.findByText("Move")
          .closest(".Button")
          .should("not.be.disabled")
          .click();
      });
    });

    it("should show moved collections inside a folder tree structure (metabase#14280)", () => {
      const NEW_COLLECTION = "New collection";

      // Create New collection within `Our analytics`
      cy.request("POST", "/api/collection", {
        name: NEW_COLLECTION,
        color: "#509EE3",
        parent_id: null,
      });

      cy.visit("/collection/root");
      cy.findByText(NEW_COLLECTION);
      cy.findByText("First collection").click();
      cy.icon("pencil").click();
      cy.findByText("Edit this collection").click();
      modal().within(() => {
        // Open the select dropdown menu
        cy.findByText("Our analytics").click();
      });
      popover().within(() => {
        cy.findByText(NEW_COLLECTION).click();
      });
      // Make sure the correct value is selected
      cy.findAllByTestId("select-button-content").contains(NEW_COLLECTION);
      cy.button("Update").click();
      // Make sure modal closed
      cy.findByText("Update").should("not.exist");

      // Make sure sidebar updated (waiting for a specific XHR didn't help)
      closeNavigationSidebar();
      openNavigationSidebar();

      cy.log(
        "**New collection should immediately be open, showing nested children**",
      );

      getSidebarCollectionChildrenFor(NEW_COLLECTION).within(() => {
        cy.findByText("First collection");
        cy.findByText("Second collection");
      });
    });

    it("should update UI when nested child collection is moved to the root collection (metabase#14482)", () => {
      getCollectionIdFromSlug("second_collection", id => {
        visitCollection(id);
      });

      cy.icon("pencil").click();
      cy.findByText("Edit this collection")
        .should("be.visible")
        .click();
      modal().within(() => {
        // Open the select dropdown menu
        cy.findByText("First collection").click();
      });

      popover().within(() => {
        cy.findAllByText("Our analytics")
          .last()
          .click();
      });

      // Make sure the correct value is selected
      cy.findAllByTestId("select-button-content").contains("Our analytics");

      cy.button("Update").click();
      // Make sure modal closed
      cy.button("Update").should("not.exist");

      navigationSidebar().within(() => {
        cy.findAllByText("Second collection").should("have.length", 1);
        cy.findAllByText("Third collection").should("have.length", 1);
      });

      ensureCollectionHasNoChildren("First collection");
    });

    it("should suggest questions saved in collections with colon in their name (metabase#14287)", () => {
      cy.request("POST", "/api/collection", {
        name: "foo:bar",
        color: "#509EE3",
        parent_id: null,
      }).then(({ body: { id: COLLECTION_ID } }) => {
        // Move question #1 ("Orders") to newly created collection
        cy.request("PUT", "/api/card/1", {
          collection_id: COLLECTION_ID,
        });
        // Sanity check: make sure Orders is indeed inside new collection
        cy.visit(`/collection/${COLLECTION_ID}`);
        cy.findByText("Orders");
      });

      startNewQuestion();
      popover().within(() => {
        cy.findByText("Saved Questions").click();
        // Note: collection name's first letter is capitalized
        cy.findByText(/foo:bar/i).click();
        cy.findByText("Orders");
      });
    });

    it("'Saved Questions' prompt should respect nested collections structure (metabase#14178)", () => {
      getCollectionIdFromSlug("second_collection", id => {
        // Move first question in a DB snapshot ("Orders") to a "Second collection"
        cy.request("PUT", "/api/card/1", {
          collection_id: id,
        });
      });

      startNewQuestion();

      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText("First collection");
        cy.findByText("Second collection").should("not.exist");
      });
    });

    describe("bulk actions", () => {
      describe("selection", () => {
        it("should be possible to apply bulk selection to all items (metabase#14705)", () => {
          bulkSelectDeselectWorkflow();
        });

        function bulkSelectDeselectWorkflow() {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");
          cy.findByText("1 item selected").should("be.visible");

          cy.findByTestId("bulk-action-bar").within(() => {
            // Select all
            cy.findByRole("checkbox");
            cy.icon("dash").click({ force: true });
            cy.icon("dash").should("not.exist");
            cy.findByText("4 items selected");

            // Deselect all
            cy.icon("check").click({ force: true });
          });
          cy.icon("check").should("not.exist");
          cy.findByTestId("bulk-action-bar").should("not.be.visible");
        }
      });

      describe("archive", () => {
        it("should be possible to bulk archive items (metabase#16496)", () => {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");

          cy.findByTestId("bulk-action-bar")
            .button("Archive")
            .click();

          cy.findByText("Orders").should("not.exist");
          cy.findByTestId("bulk-action-bar").should("not.be.visible");
        });
      });

      describe("move", () => {
        it("should be possible to bulk move items", () => {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");

          cy.findByTestId("bulk-action-bar")
            .button("Move")
            .click();

          modal().within(() => {
            cy.findByText("First collection").click();
            cy.button("Move").click();
          });

          cy.findByText("Orders").should("not.exist");
          cy.findByTestId("bulk-action-bar").should("not.be.visible");

          // Check that items were actually moved
          navigationSidebar()
            .findByText("First collection")
            .click();
          cy.findByText("Orders");
        });
      });
    });

    it("collections list on the home page shouldn't depend on the name of the first 50 objects (metabase#16784)", () => {
      // Although there are already some objects in the default snapshot (3 questions, 1 dashboard, 3 collections),
      // let's create 50 more dashboards with the letter of alphabet `D` coming before the first letter of the existing collection `F`.
      _.times(50, i => cy.createDashboard({ name: `Dashboard ${i}` }));

      cy.visit("/");
      // There is already a collection named "First collection" in the default snapshot
      navigationSidebar().within(() => {
        cy.findByText("First collection");
      });
    });
  });
});

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

function selectItemUsingCheckbox(item, icon = "table") {
  cy.findByText(item)
    .closest("tr")
    .within(() => {
      cy.icon(icon).trigger("mouseover");
      cy.findByRole("checkbox").click();
    });
}

function getSidebarCollectionChildrenFor(item) {
  return navigationSidebar()
    .findByText(item)
    .parentsUntil("[data-testid=sidebar-collection-link-root]")
    .parent()
    .next("ul");
}

function visitRootCollection() {
  cy.intercept("GET", "/api/collection/root/items?**").as(
    "fetchRootCollectionItems",
  );

  cy.visit("/collection/root");

  cy.wait(["@fetchRootCollectionItems", "@fetchRootCollectionItems"]);
}

function visitCollection(id) {
  const alias = `getCollection${id}Items`;

  cy.intercept("GET", `/api/collection/${id}/items?**`).as(alias);

  cy.visit(`/collection/${id}`);

  cy.wait([`@${alias}`, `@${alias}`]);
}

function ensureCollectionHasNoChildren(collection) {
  cy.findByText(collection)
    .closest("li")
    .within(() => {
      // We used should.not.exist previously, but
      // this icon is now only hidden. It still exists in the DOM.
      cy.icon("chevronright").should("be.hidden");
    });
}
