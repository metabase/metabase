import { assocIn } from "icepick";
import _ from "underscore";
import {
  restore,
  modal,
  popover,
  openOrdersTable,
  navigationSidebar,
  getCollectionIdFromSlug,
  openNavigationSidebar,
  closeNavigationSidebar,
  openCollectionMenu,
  visitCollection,
  openUnpinnedItemMenu,
  getPinnedSection,
} from "e2e/support/helpers";
import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { displaySidebarChildOf } from "./helpers/e2e-collections-sidebar.js";

const { nocollection } = USERS;
const { DATA_GROUP } = USER_GROUPS;

describe("scenarios > collection defaults", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("new collection modal", () => {
    it("should be usable on small screens", () => {
      const COLLECTIONS_COUNT = 5;
      _.times(COLLECTIONS_COUNT, index => {
        cy.request("POST", "/api/collection", {
          name: `Collection ${index + 1}`,
          color: "#509EE3",
          parent_id: null,
        });
      });

      cy.visit("/");

      cy.viewport(800, 500);

      cy.findByText("New").click();
      cy.findByText("Collection").click();

      modal().within(() => {
        cy.findByLabelText("Name").type("Test collection");
        cy.findByLabelText("Description").type("Test collection description");
        cy.findByText("Our analytics").click();
      });

      popover().within(() => {
        cy.findByText(`Collection ${COLLECTIONS_COUNT}`).click();
      });

      cy.findByText("Create").click();

      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "Test collection",
      );
    });
  });

  describe("sidebar behavior", () => {
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
      navigationSidebar().within(() => {
        displaySidebarChildOf("Fourth collection");
      });

      // 2. Ensure we show the helpful tooltip with the full (long) collection name
      cy.findByText("Fifth collection with a very long name").realHover();
      popover().contains("Fifth collection with a very long name");
    });

    it("should be usable on mobile screen sizes (metabase#15006)", () => {
      cy.viewport(480, 800);

      visitRootCollection();

      cy.log(
        "should be able to toggle collections sidebar when switched to mobile screen size",
      );

      navigationSidebar().should("have.attr", "aria-hidden", "true");
      openNavigationSidebar();

      closeNavigationSidebar();
      navigationSidebar().should("have.attr", "aria-hidden", "true");

      cy.log(
        "should close collections sidebar when collection is clicked in mobile screen size",
      );

      openNavigationSidebar();

      navigationSidebar().within(() => {
        cy.findByText("First collection").click();
      });

      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "First collection",
      );

      navigationSidebar().should("have.attr", "aria-hidden", "true");
    });
  });

  describe("render last edited by when names are null", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should render short value without tooltip", () => {
      cy.intercept(
        "GET",
        "/api/collection/root/items?models=dashboard**",
        req => {
          req.on("response", res => {
            res.send(
              assocIn(res.body, ["data", 0, "last-edit-info"], {
                id: 1,
                last_name: null,
                first_name: null,
                email: "admin@metabase.test",
                timestamp: "2022-07-05T07:31:09.054-07:00",
              }),
            );
          });
        },
      );
      visitRootCollection();
      cy.findByText("admin@metabase.test").trigger("mouseenter");
      cy.findByRole("tooltip").should("not.exist");
    });

    it("should render long value with tooltip", () => {
      cy.intercept(
        "GET",
        "/api/collection/root/items?models=dashboard**",
        req => {
          req.on("response", res => {
            res.send(
              assocIn(res.body, ["data", 0, "last-edit-info"], {
                id: 1,
                last_name: null,
                first_name: null,
                email: "averyverylongemail@veryverylongdomain.com",
                timestamp: "2022-07-05T07:31:09.054-07:00",
              }),
            );
          });
        },
      );
      visitRootCollection();
      cy.findByText("averyverylongemail@veryverylongdomain.com").trigger(
        "mouseenter",
      );
      cy.findByRole("tooltip").should("exist");
    });
  });

  describe("Collection related issues reproductions", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it.skip("should show list of collection items even if one question has invalid parameters (metabase#25543)", () => {
      const questionDetails = {
        native: { query: "select 1 --[[]]", "template-tags": {} },
      };

      cy.createNativeQuestion(questionDetails);

      visitRootCollection();
      cy.findByText("Orders in a dashboard");
    });

    it("should be able to drag an item to the root collection (metabase#16498)", () => {
      moveItemToCollection("Orders", "First collection");

      getCollectionIdFromSlug("first_collection", id => {
        visitCollection(id);
      });

      cy.findByText("Orders").as("dragSubject");

      navigationSidebar().findByText("Our analytics").as("dropTarget");

      dragAndDrop("dragSubject", "dropTarget");

      cy.findByText("Moved question");
      cy.findByText("Orders").should("not.exist");

      visitRootCollection();
      cy.findByText("Orders");
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

      it("should see a child collection in a sidebar even with revoked access to its parents (metabase#14114, metabase#16555, metabase#20716)", () => {
        cy.visit("/");

        navigationSidebar().within(() => {
          cy.findByText("Our analytics").should("not.exist");
          cy.findByText("Parent").should("not.exist");
          cy.findByText("Child");
          cy.findByText("Your personal collection");
        });

        // Even if user tries to navigate directly to the root collection, we have to make sure its content is not shown
        cy.visit("/collection/root");
        cy.findByText("You don't have permissions to do that.");
      });

      it("should be able to choose a child collection when saving a question (metabase#14052)", () => {
        openOrdersTable();
        cy.findByText("Save").click();
        // Click to choose which collection should this question be saved to
        cy.findByText(revokedUsersPersonalCollectionName).click();
        popover().within(() => {
          cy.findByText(/Collections/i);
          cy.findByText(/My personal collection/i);
          cy.findByText("Parent").should("not.exist");
          cy.log("Reported failing from v0.34.3");
          cy.findByText("Child");
        });
      });
    });

    it("sub-collection should be available in save and move modals (metabase#14122)", () => {
      const COLLECTION = "14122C";

      // Create Parent collection within admin's personal collection
      cy.createCollection({
        name: COLLECTION,
        parent_id: 1,
      });

      visitRootCollection();

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

        cy.button("Move").should("not.be.disabled");
      });
    });

    it("moving collections should update the UI (metabase#14280, metabase#14482)", () => {
      const NEW_COLLECTION = "New collection";

      // Create New collection within `Our analytics`
      cy.createCollection({
        name: NEW_COLLECTION,
        parent_id: null,
      });

      cy.log(
        "when nested child collection is moved to the root collection (metabase#14482)",
      );

      getCollectionIdFromSlug("second_collection", id => {
        visitCollection(id);
      });

      moveOpenedCollectionTo("Our analytics");

      navigationSidebar().within(() => {
        ensureCollectionHasNoChildren("First collection");

        // Should be expanded automatically
        ensureCollectionIsExpanded("Second collection");
        // Move into the "Third collection"
        cy.findByText("Third collection").click();
      });

      cy.log(
        "should show moved collection inside a folder tree structure (metabase#14280)",
      );

      moveOpenedCollectionTo(NEW_COLLECTION);

      navigationSidebar().within(() => {
        ensureCollectionHasNoChildren("Second collection");

        ensureCollectionIsExpanded(NEW_COLLECTION, {
          children: ["Third collection"],
        });
      });
    });

    describe("bulk actions", () => {
      describe("selection", () => {
        it("should be possible to apply bulk selection to all items (metabase#14705)", () => {
          cy.visit("/collection/root");

          // Pin one item
          openUnpinnedItemMenu("Orders, Count");
          popover().findByText("Pin this").click();
          getPinnedSection().within(() => {
            cy.findByText("18,760");
          });

          // Select one
          selectItemUsingCheckbox("Orders");
          cy.findByText("1 item selected").should("be.visible");
          cy.icon("dash").should("exist");
          cy.icon("check").should("exist");

          // Select all
          cy.findByLabelText("Select all items").click();
          cy.icon("dash").should("not.exist");
          cy.findByText("4 items selected");

          // Deselect all
          cy.findByLabelText("Select all items").click();

          cy.icon("check").should("not.exist");
          cy.findByText(/item(s)? selected/).should("not.be.visible");
        });

        it("should clean up selection when opening another collection (metabase#16491)", () => {
          cy.request("PUT", "/api/card/1", {
            collection_id: 1,
          });
          cy.visit("/collection/root");
          cy.findByText("Your personal collection").click();

          selectItemUsingCheckbox("Orders");
          cy.findByText("1 item selected").should("be.visible");

          cy.findByText("Our analytics").click();
          cy.findByTestId("bulk-action-bar").should("not.be.visible");
        });
      });

      describe("archive", () => {
        it("should be possible to bulk archive items (metabase#16496)", () => {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");

          cy.findByTestId("bulk-action-bar").button("Archive").click();

          cy.findByText("Orders").should("not.exist");
          cy.findByTestId("bulk-action-bar").should("not.be.visible");
        });
      });

      describe("move", () => {
        it("should be possible to bulk move items", () => {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");

          cy.findByTestId("bulk-action-bar").button("Move").click();

          modal().within(() => {
            cy.findByText("First collection").click();
            cy.button("Move").click();
          });

          cy.findByText("Orders").should("not.exist");
          cy.findByTestId("bulk-action-bar").should("not.be.visible");

          // Check that items were actually moved
          navigationSidebar().findByText("First collection").click();
          cy.findByText("Orders");
        });
      });
    });

    it("collections list on the home page shouldn't depend on the name of the first 50 objects (metabase#16784)", () => {
      // Although there are already some objects in the default snapshot (3 questions, 1 dashboard, 3 collections),
      // let's create 50 more dashboards with the letter of alphabet `D` coming before the first letter of the existing collection `F`.
      Cypress._.times(50, i => cy.createDashboard({ name: `Dashboard ${i}` }));

      cy.visit("/");
      // There is already a collection named "First collection" in the default snapshot
      navigationSidebar().within(() => {
        cy.findByText("First collection");
      });
    });

    it("should create new collections within the current collection", () => {
      getCollectionIdFromSlug("third_collection", collection_id => {
        visitCollection(collection_id);
        cy.findByText("New").click();

        popover().within(() => {
          cy.findByText("Collection").click();
        });

        modal().within(() => {
          cy.findByText("Collection it's saved in").should("be.visible");
          cy.findByText("Third collection").should("be.visible");
        });
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

function visitRootCollection() {
  cy.intercept("GET", "/api/collection/root/items?**").as(
    "fetchRootCollectionItems",
  );

  cy.visit("/collection/root");

  cy.wait(["@fetchRootCollectionItems", "@fetchRootCollectionItems"]);
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

function ensureCollectionIsExpanded(collection, { children = [] } = {}) {
  cy.findByText(collection)
    .closest("[data-testid=sidebar-collection-link-root]")
    .as("root")
    .within(() => {
      cy.icon("chevronright").should("not.be.hidden");
    });

  if (children && children.length > 0) {
    cy.get("@root")
      .next("ul")
      .within(() => {
        children.forEach(child => {
          cy.findByText(child);
        });
      });
  }
}

function moveOpenedCollectionTo(newParent) {
  openCollectionMenu();
  popover().within(() => cy.findByText("Move").click());

  cy.findAllByTestId("item-picker-item").contains(newParent).click();

  modal().within(() => {
    cy.button("Move").click();
  });
  // Make sure modal closed
  modal().should("not.exist");
}

function dragAndDrop(subjectAlias, targetAlias) {
  const dataTransfer = new DataTransfer();

  cy.get("@" + subjectAlias).trigger("dragstart", { dataTransfer });
  cy.get("@" + targetAlias).trigger("drop", { dataTransfer });
  cy.get("@" + subjectAlias).trigger("dragend");
}

function moveItemToCollection(itemName, collectionName) {
  cy.request("GET", "/api/collection/root/items").then(resp => {
    const ALL_ITEMS = resp.body.data;

    const { id, model } = getCollectionItem(ALL_ITEMS, itemName);
    const { id: collection_id } = getCollectionItem(ALL_ITEMS, collectionName);

    cy.request("PUT", `/api/${model}/${id}`, {
      collection_id,
    });
  });

  function getCollectionItem(collection, itemName) {
    return collection.find(item => item.name === itemName);
  }
}
