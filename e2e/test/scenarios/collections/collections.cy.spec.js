import { assocIn } from "icepick";
import _ from "underscore";

import { SAMPLE_DB_ID, USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ALL_USERS_GROUP_ID,
  FIRST_COLLECTION_ID,
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  closeNavigationSidebar,
  createCollection,
  createQuestion,
  dragAndDrop,
  entityPickerModal,
  entityPickerModalItem,
  entityPickerModalTab,
  getPinnedSection,
  moveOpenedCollectionTo,
  navigationSidebar,
  openCollectionItemMenu,
  openCollectionMenu,
  openNavigationSidebar,
  openOrdersTable,
  openUnpinnedItemMenu,
  pickEntity,
  popover,
  restore,
  sidesheet,
  visitCollection,
} from "e2e/support/helpers";

import { displaySidebarChildOf } from "./helpers/e2e-collections-sidebar.js";

const { nocollection } = USERS;
const { DATA_GROUP } = USER_GROUPS;
const { ORDERS, ORDERS_ID, FEEDBACK_ID } = SAMPLE_DATABASE;

describe("scenarios > collection defaults", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/**/items?pinned_state*").as("getPinnedItems");
    cy.intercept("GET", "/api/collection/tree**").as("getTree");
    cy.intercept("GET", "/api/collection/*/items?**").as("getCollectionItems");
  });

  describe("new collection modal", () => {
    it("should be usable on small screens", () => {
      const COLLECTIONS_COUNT = 5;
      _.times(COLLECTIONS_COUNT, index => {
        cy.request("POST", "/api/collection", {
          name: `Collection ${index + 1}`,
          parent_id: null,
        });
      });

      cy.visit("/");

      cy.viewport(800, 500);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Collection").click();

      cy.findByTestId("new-collection-modal").then(modal => {
        cy.findByPlaceholderText("My new fantastic collection").type(
          "Test collection",
        );
        cy.findByLabelText("Description").type("Test collection description");
        cy.findByTestId("collection-picker-button")
          .findByText("Our analytics")
          .click();
      });

      pickEntity({
        path: ["Our analytics", `Collection ${COLLECTIONS_COUNT}`],
        select: true,
        tab: "Collections",
      });

      cy.findByTestId("new-collection-modal").button("Create").click();

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

      visitCollection(SECOND_COLLECTION_ID);

      navigationSidebar().within(() => {
        cy.findByText("Second collection");
        cy.findByText("Third collection");

        // Collections without sub-collections shouldn't have chevron icon (metabase#14753)
        ensureCollectionHasNoChildren("Third collection");
        ensureCollectionHasNoChildren("Your personal collection");
      });
    });

    it("should correctly display deep nested collections with long names", () => {
      cy.log("Create two more nested collections");

      ["Fourth collection", "Fifth collection with a very long name"].forEach(
        (collection, index) => {
          cy.request("POST", "/api/collection", {
            name: collection,
            parent_id: THIRD_COLLECTION_ID + index,
          });
        },
      );

      visitCollection(THIRD_COLLECTION_ID);

      // 1. Expand so that deeply nested collection is showing
      navigationSidebar().within(() => {
        displaySidebarChildOf("Fourth collection");
      });

      // 2. Ensure we show the helpful tooltip with the full (long) collection name
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Fifth collection with a very long name").realHover();
      cy.findByRole("tooltip", {
        name: /Fifth collection with a very long name/,
      });
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

  it("should support markdown in collection description in caption", () => {
    cy.request("PUT", `/api/collection/${FIRST_COLLECTION_ID}`, {
      description: "[link](https://metabase.com)",
    });

    visitRootCollection();

    cy.get("table").within(() => {
      cy.findByText("First collection")
        .closest("tr")
        .within(() => {
          cy.icon("info").trigger("mouseenter");
        });
    });

    cy.findByRole("tooltip").within(() => {
      cy.findByRole("link").should("include.text", "link");
      cy.findByRole("link").should("not.include.text", "[link]");
    });
  });

  it("should allow description to be edited in the sidesheet", () => {
    cy.request("PUT", `/api/collection/${FIRST_COLLECTION_ID}`, {
      description: "[link](https://metabase.com)",
    });

    visitRootCollection();
    cy.log("Collection description visible on page");
    const page = cy.findByRole("presentation");
    page.within(() => {
      const textarea = cy.findByTestId("editable-text");
      textarea.should("have.value", "[link](https://metabase.com)");
    });
    const getSidesheetToggle = () =>
      cy.findByTestId("collection-menu").icon("info").click();

    cy.log("Let's edit the description");
    getSidesheetToggle().click();
    sidesheet().within(() => {
      const textarea = cy.findByTestId("editable-text");
      textarea.click();
      cy.type("edited ");
      cy.realPress("Tab");
      cy.findByLabelText("Close").click();
    });

    cy.log("The edited description is visible on the page");
    const pageAfterEdit = cy.findByRole("presentation");
    pageAfterEdit.within(() => {
      const textarea = cy.findByTestId("editable-text");
      textarea.should("have.value", "edited [link](https://metabase.com)");
    });

    cy.log("The edited description is visible in the sidesheet");
    getSidesheetToggle().click();
    sidesheet().within(() => {
      const textarea = cy.findByTestId("editable-text");
      textarea.should("have.value", "edited [link](https://metabase.com)");
    });
  });

  describe("render last edited by when names are null", () => {
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
                email: "me@email.com",
                timestamp: "2022-07-05T07:31:09.054-07:00",
              }),
            );
          });
        },
      );
      visitRootCollection();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("me@email.com").trigger("mouseenter");
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
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    it("should handle moving a question when you don't have access to entier collection path (metabase#44316", () => {
      cy.createCollection({
        name: "Collection A",
      }).then(({ body: collectionA }) => {
        cy.createCollection({
          name: "Collection B",
          parent_id: collectionA.id,
        }).then(({ body: collectionB }) => {
          cy.createCollection({
            name: "Collection C",
            parent_id: collectionB.id,
          }).then(({ body: collectionC }) => {
            cy.createCollection({
              name: "Collection D",
              parent_id: collectionC.id,
            }).then(({ body: collectionD }) => {
              cy.createCollection({
                name: "Collection E",
                parent_id: collectionD.id,
              }).then(({ body: collectionE }) => {
                cy.updatePermissionsGraph({
                  [ALL_USERS_GROUP_ID]: {
                    [SAMPLE_DB_ID]: {
                      "view-data": "unrestricted",
                      "create-queries": "query-builder-and-native",
                    },
                  },
                });
                cy.updateCollectionGraph({
                  [ALL_USERS_GROUP_ID]: {
                    root: "none",
                    [collectionA.id]: "none",
                    [collectionB.id]: "write",
                    [collectionC.id]: "none",
                    [collectionD.id]: "none",
                    [collectionE.id]: "write",
                  },
                });
                cy.signIn("none");
                createQuestion(
                  {
                    name: "Foo Question",
                    query: {
                      "source-table": FEEDBACK_ID,
                    },
                    collection_id: collectionE.id,
                  },
                  {
                    visitQuestion: true,
                  },
                );
              });
            });
          });
        });
      });

      cy.findByTestId("qb-header").icon("ellipsis").click();
      popover().findByText("Move").click();
      entityPickerModalItem(1, "Collection B").should("exist");
      entityPickerModalItem(2, "Collection E").should("exist");

      entityPickerModal().should(
        "not.contain.text",
        "You don't have permissions to do that.",
      );
    });

    it("should show list of collection items even if one question has invalid parameters (metabase#25543)", () => {
      const questionDetails = {
        native: { query: "select 1 --[[]]", "template-tags": {} },
      };

      cy.createNativeQuestion(questionDetails);

      visitRootCollection();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard");
    });

    it("should be able to drag an item to the root collection (metabase#16498)", () => {
      moveItemToCollection("Orders", "First collection");

      visitCollection(FIRST_COLLECTION_ID);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").as("dragSubject");

      navigationSidebar().findByText("Our analytics").as("dropTarget");

      dragAndDrop("dragSubject", "dropTarget");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Moved question");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").should("not.exist");

      visitRootCollection();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders");
    });

    describe("nested collections with revoked parent access", () => {
      const { first_name, last_name } = nocollection;
      const revokedUsersPersonalCollectionName = `${first_name} ${last_name}'s Personal Collection`;

      beforeEach(() => {
        // Create Parent collection within `Our analytics`
        cy.request("POST", "/api/collection", {
          name: "Parent",
          parent_id: null,
        }).then(({ body: { id: PARENT_COLLECTION_ID } }) => {
          // Create Child collection within Parent collection
          cy.request("POST", "/api/collection", {
            name: "Child",
            parent_id: PARENT_COLLECTION_ID,
          }).then(({ body: { id: CHILD_COLLECTION_ID } }) => {
            // Fetch collection permission graph
            cy.request("GET", "/api/collection/graph").then(
              ({ body: { groups, revision } }) => {
                // Give `Data` group permission to "curate" Child collection only
                // Access to everything else is revoked by default - that's why we chose `Data` group
                groups[DATA_GROUP][CHILD_COLLECTION_ID] = "write";

                // We're chaining these 2 requestes in order to match schema (passing it from GET to PUT)
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
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You don't have permissions to do that.");
      });

      it("should be able to choose a child collection when saving a question (metabase#14052)", () => {
        openOrdersTable();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Save").click();
        // Click to choose which collection should this question be saved to
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(revokedUsersPersonalCollectionName).click();
        pickEntity({ path: [revokedUsersPersonalCollectionName] });
        pickEntity({ path: ["Collections", "Child"] });
        entityPickerModal().button("Select").should("be.enabled");
        cy.log("Reported failing from v0.34.3");
        cy.findByTestId("entity-picker-modal")
          .findByText("Parent")
          .should("not.exist");
      });
    });

    it("sub-collection should be available in save and move modals (metabase#14122)", () => {
      const COLLECTION = "14122C";

      // Create Parent collection within admin's personal collection
      cy.createCollection({
        name: COLLECTION,
        parent_id: ADMIN_PERSONAL_COLLECTION_ID,
      });

      visitRootCollection();

      openEllipsisMenuFor("Orders");

      popover().within(() => {
        cy.findByText("Move").click();
      });

      entityPickerModal().within(() => {
        cy.findByRole("tab", { name: /Collections/ }).click();
        cy.findByText("Bobby Tables's Personal Collection").click();
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

      visitCollection(SECOND_COLLECTION_ID);

      openCollectionMenu();
      popover().findByText("Move").click();

      // we need to do this manually because we need to await the correct number of api requests to keep this from flaking

      entityPickerModal().within(() => {
        cy.findByTestId("loading-indicator").should("not.exist");
        cy.findByRole("tab", { name: /Collections/ }).click();
        cy.wait([
          "@getCollectionItems",
          "@getCollectionItems",
          "@getCollectionItems",
        ]);
        // make sure the first collection (current parent) is selected
        findPickerItem("First collection").should(
          "have.attr",
          "data-active",
          "true",
        );
        // then click our analytics
        cy.findByText("Our analytics").click();
        cy.button("Move").click();
      });

      entityPickerModal().should("not.exist");
      cy.wait("@getTree");

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
      cy.wait("@getTree");

      navigationSidebar().within(() => {
        ensureCollectionHasNoChildren("Second collection");

        ensureCollectionIsExpanded(NEW_COLLECTION, {
          children: ["Third collection"],
        });
      });

      cy.log(
        "the collection picker should show an error if we are unable to move a collection (metabase#40700)",
      );
      cy.intercept("PUT", `/api/collection/${THIRD_COLLECTION_ID}`, {
        statusCode: 500,
        body: { message: "Ryan said no" },
      });
      openCollectionMenu();
      popover().findByText("Move").click();

      entityPickerModal().within(() => {
        entityPickerModalTab("Collections").click();
        entityPickerModalItem(0, "Our analytics").click();
        cy.button("Move").click();
        cy.log("Entity picker should show an error message");
        cy.findByText("Ryan said no").should("exist");
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
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("1 item selected").should("be.visible");
          cy.icon("dash").should("exist");
          cy.icon("check").should("exist");

          // Select all
          cy.findByLabelText("Select all items").click();
          cy.icon("dash").should("not.exist");
          cy.findByTestId("toast-card").findByText(/\d+ items selected/);

          // Deselect all
          cy.findByLabelText("Select all items").click();

          cy.icon("check").should("not.exist");
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText(/item(s)? selected/).should("not.exist");
        });

        it("should clean up selection when opening another collection (metabase#16491)", () => {
          cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
            collection_id: ADMIN_PERSONAL_COLLECTION_ID,
          });
          cy.visit("/collection/root");
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Your personal collection").click();

          selectItemUsingCheckbox("Orders");
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("1 item selected").should("be.visible");

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Our analytics").click();
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText(/item(s)? selected/).should("not.exist");
        });
      });

      describe("archive", () => {
        it("should be possible to bulk archive items (metabase#16496)", () => {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");

          cy.findByTestId("toast-card")
            .parent()
            .button("Move to trash")
            .click();

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Orders").should("not.exist");
          cy.findByTestId("toast-card").should("not.exist");
        });
      });

      describe("move", () => {
        it("should be possible to bulk move items and undo", () => {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");

          cy.findByTestId("toast-card").button("Move").click();

          entityPickerModal().within(() => {
            cy.findByText("First collection").click();
            cy.button("Move").click();
          });

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Orders").should("not.exist");
          cy.findByTestId("toast-card").should("not.exist");

          // Check that items were actually moved
          navigationSidebar().findByText("First collection").click();
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Orders");

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Undo").click();
          navigationSidebar().findByText("Our analytics").click();
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Orders").should("be.visible");
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.findByText("Undo").should("not.exist");
        });

        it("moving collections should disable moving into any of the moving collections", () => {
          cy.createCollection({ name: "Another collection" });

          cy.log("moving a single collection");
          cy.visit(`/collection/${SECOND_COLLECTION_ID}`);

          cy.log("from the collection header");

          cy.findByTestId("collection-menu").icon("ellipsis").click();
          popover().findByText("Move").click();

          entityPickerModal().within(() => {
            cy.findByRole("tab", { name: /Collections/ }).click();
            cy.log("parent collection should be selected");
            findPickerItem("First collection").should(
              "have.attr",
              "data-active",
              "true",
            );

            cy.log("moving collection should be visible but disabled");
            findPickerItem("Second collection").should("have.attr", "disabled");
            cy.findByText("Cancel").click();
          });

          cy.log("from the collection items list");

          cy.findByTestId("collection-table").within(() => {
            openEllipsisMenuFor("Third collection");
          });

          popover().findByText("Move").click();

          entityPickerModal().within(() => {
            cy.log("parent collection should be selected");
            cy.findByRole("tab", { name: /Collections/ }).click();
            findPickerItem("Second collection").should(
              "have.attr",
              "data-active",
              "true",
            );

            cy.log("moving collection should be visible but disabled");
            findPickerItem("Third collection").should("have.attr", "disabled");
            cy.findByText("Cancel").click();
          });

          cy.log("bulk moving items that include collections");
          cy.visit("/collection/root");

          cy.findByTestId("collection-table").within(() => {
            selectItemUsingCheckbox("Orders");
            selectItemUsingCheckbox("Another collection");
            selectItemUsingCheckbox("First collection");
          });

          cy.findByTestId("toast-card").button("Move").click();

          entityPickerModal().within(() => {
            cy.log("should disable all moving collections");
            findPickerItem("First collection").should("have.attr", "disabled");
            findPickerItem("Another collection").should(
              "have.attr",
              "disabled",
            );
            findPickerItem("Our analytics").should(
              "have.attr",
              "data-active",
              "true",
            );
          });
        });

        it("moving collections should disable moving into any of the moving collections in recents or search (metabase#45248)", () => {
          createCollection({ name: "Outer collection 1" }).then(
            ({ body: { id: parentCollectionId } }) => {
              cy.wrap(parentCollectionId).as("outerCollectionId");
              createCollection({
                name: "Inner collection 1",
                parent_id: parentCollectionId,
              }).then(({ body: { id: innerCollectionId } }) => {
                cy.wrap(innerCollectionId).as("innerCollectionId");
              });
              createCollection({
                name: "Inner collection 2",
                parent_id: parentCollectionId,
              });
            },
          );
          createCollection({ name: "Outer collection 2" });

          // modify the inner collection so that it shows up in recents
          cy.get("@innerCollectionId").then(innerCollectionId => {
            cy.request("PUT", `/api/collection/${innerCollectionId}`, {
              name: "Inner collection 1 - modified",
            });
          });
          cy.visit("/collection/root");

          cy.log("single move");

          cy.findByTestId("collection-table").within(() => {
            openCollectionItemMenu("Outer collection 1");
          });

          popover().findByText("Move").click();

          entityPickerModal().within(() => {
            entityPickerModalTab("Recents").should(
              "have.attr",
              "data-active",
              "true",
            );

            cy.findByText(/inner collection/).should("not.exist");

            cy.button("Cancel").click();
          });

          cy.log("bulk move");

          cy.findByTestId("collection-table").within(() => {
            selectItemUsingCheckbox("Orders");
            selectItemUsingCheckbox("Outer collection 1");
          });

          cy.findByTestId("toast-card").button("Move").click();

          entityPickerModal().within(() => {
            entityPickerModalTab("Recents").should(
              "have.attr",
              "data-active",
              "true",
            );

            cy.findByText(/inner collection/).should("not.exist");
          });
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
      visitCollection(THIRD_COLLECTION_ID);
      cy.findByTestId("app-bar").findByText("New").click();

      popover().within(() => {
        cy.findByText("Collection").click();
      });

      cy.findByTestId("new-collection-modal").then(modal => {
        cy.findByText("Collection it's saved in").should("be.visible");
        cy.findByTestId("collection-picker-button")
          .findByText("Third collection")
          .should("be.visible");
      });
    });
  });

  describe("x-rays", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();
      cy.intercept("GET", "/api/automagic-dashboards/model/*").as("dashboard");
    });

    it("should allow to x-ray models from collection views", () => {
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
      cy.visit("/collection/root");

      openEllipsisMenuFor("Orders");
      popover().findByText("X-ray this").click();
      cy.wait("@dashboard");
    });
  });
});

describe("scenarios > collection items listing", () => {
  function toggleSortingFor(columnName) {
    const testId = "items-table-head";
    cy.findByTestId(testId).findByText(columnName).click();
  }

  function assertCollectionItemsOrder(testId, names) {
    for (let index = 0; index < names.length; ++index) {
      cy.findAllByTestId(testId).eq(index).should("have.text", names[index]);
    }
  }

  function visitRootCollection() {
    cy.visit("/collection/root");
    cy.wait(["@getCollectionItems", "@getCollectionItems"]);
  }

  function archiveAll() {
    cy.request("GET", "/api/collection/root/items").then(response => {
      response.body.data.forEach(({ model, id }) => {
        if (model !== "collection") {
          cy.request(
            "PUT",
            `/api/${model === "dataset" ? "card" : model}/${id}`,
            {
              archived: true,
            },
          );
        }
      });
    });
  }

  beforeEach(() => {
    cy.intercept("GET", "/api/collection/root/items?*").as(
      "getCollectionItems",
    );

    restore();
    cy.signInAsAdmin();
  });

  const TEST_QUESTION_QUERY = {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ],
  };

  const PAGE_SIZE = 25;

  describe("pagination", () => {
    const SUBCOLLECTIONS = 1;
    const ADDED_QUESTIONS = 15;
    const ADDED_DASHBOARDS = 14;

    const TOTAL_ITEMS = SUBCOLLECTIONS + ADDED_DASHBOARDS + ADDED_QUESTIONS;

    beforeEach(() => {
      // Removes questions and dashboards included in the default database,
      // so the test won't fail if we change the default database
      archiveAll();

      _.times(ADDED_DASHBOARDS, i =>
        cy.createDashboard({ name: `dashboard ${i}` }),
      );
      _.times(ADDED_QUESTIONS, i =>
        cy.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
        }),
      );
    });

    it("should allow to navigate back and forth", () => {
      visitRootCollection();

      // First page
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);

      cy.findByLabelText("Next page").click();
      cy.wait("@getCollectionItems");

      // Second page
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should(
        "have.length",
        TOTAL_ITEMS - PAGE_SIZE,
      );
      cy.findByLabelText("Next page").should("be.disabled");

      cy.findByLabelText("Previous page").click();

      // First page
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
      cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
      cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);
    });
  });

  describe("sorting", () => {
    beforeEach(() => {
      // Removes questions and dashboards included in a default dataset,
      // so it's easier to test sorting
      archiveAll();
    });

    it("should allow to sort unpinned items by columns asc and desc", () => {
      ["A", "B", "C"].forEach((letter, i) => {
        cy.createDashboard({
          name: `${letter} Dashboard`,
          collection_position: null,
        });

        // Signing in as a different users, so we have different names in "Last edited by"
        // In that way we can test sorting by this column correctly
        cy.signIn("normal");

        cy.createQuestion({
          name: `${letter} Question`,
          collection_position: null,
          query: TEST_QUESTION_QUERY,
        });
      });

      visitRootCollection();
      // We're waiting for the loading spinner to disappear from the main sidebar.
      // Otherwise, this causes the page re-render and the flaky test.
      cy.findByTestId("main-navbar-root").get("circle").should("not.exist");

      cy.log("sorted alphabetically by default");
      assertCollectionItemsOrder("collection-entry-name", [
        "A Dashboard",
        "A Question",
        "B Dashboard",
        "B Question",
        "C Dashboard",
        "C Question",
        "First collection",
      ]);

      toggleSortingFor(/Name/i);
      cy.wait("@getCollectionItems");

      cy.log("sorted alphabetically reversed");
      assertCollectionItemsOrder("collection-entry-name", [
        "First collection",
        "C Question",
        "C Dashboard",
        "B Question",
        "B Dashboard",
        "A Question",
        "A Dashboard",
      ]);

      toggleSortingFor(/Name/i);
      // Not sure why the same XHR doesn't happen after we click the "Name" sorting again?
      cy.log("sorted alphabetically");
      assertCollectionItemsOrder("collection-entry-name", [
        "A Dashboard",
        "A Question",
        "B Dashboard",
        "B Question",
        "C Dashboard",
        "C Question",
        "First collection",
      ]);

      toggleSortingFor(/Type/i);
      cy.wait("@getCollectionItems");

      cy.log("sorted dashboards first");
      assertCollectionItemsOrder("collection-entry-name", [
        "A Dashboard",
        "B Dashboard",
        "C Dashboard",
        "A Question",
        "B Question",
        "C Question",
        "First collection",
      ]);

      toggleSortingFor(/Type/i);
      cy.wait("@getCollectionItems");

      cy.log("sorted collections first");
      assertCollectionItemsOrder("collection-entry-name", [
        "First collection",
        "A Question",
        "B Question",
        "C Question",
        "A Dashboard",
        "B Dashboard",
        "C Dashboard",
      ]);

      toggleSortingFor(/Last edited by/i);
      cy.wait("@getCollectionItems");

      cy.log("sorted by last editor name alphabetically");
      assertCollectionItemsOrder("collection-entry-last-edited-by", [
        "Bobby Tables",
        "Robert Tableton",
        "Robert Tableton",
        "Robert Tableton",
        "Robert Tableton",
        "Robert Tableton",
        "",
      ]);

      toggleSortingFor(/Last edited by/i);
      cy.wait("@getCollectionItems");

      cy.log("sorted by last editor name alphabetically reversed");
      assertCollectionItemsOrder("collection-entry-last-edited-by", [
        "Robert Tableton",
        "Robert Tableton",
        "Robert Tableton",
        "Robert Tableton",
        "Robert Tableton",
        "Bobby Tables",
        "",
      ]);

      toggleSortingFor(/Last edited at/i);
      cy.wait("@getCollectionItems");

      cy.log("sorted newest last");
      assertCollectionItemsOrder("collection-entry-name", [
        "A Dashboard",
        "A Question",
        "B Dashboard",
        "B Question",
        "C Dashboard",
        "C Question",
        "First collection",
      ]);

      toggleSortingFor(/Last edited at/i);
      cy.wait("@getCollectionItems");

      cy.log("sorted newest first");
      assertCollectionItemsOrder("collection-entry-name", [
        "C Question",
        "C Dashboard",
        "B Question",
        "B Dashboard",
        "A Question",
        "A Dashboard",
        "First collection",
      ]);
    });

    it("should reset pagination if sorting applied on not first page", () => {
      _.times(15, i => cy.createDashboard(`dashboard ${i}`));
      _.times(15, i =>
        cy.createQuestion({
          name: `generated question ${i}`,
          query: TEST_QUESTION_QUERY,
        }),
      );

      visitRootCollection();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);

      cy.findByLabelText("Next page").click();
      cy.wait("@getCollectionItems");

      toggleSortingFor(/Last edited at/i);
      cy.wait("@getCollectionItems");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`1 - ${PAGE_SIZE}`);
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
    .within(() => cy.findByRole("checkbox").click());
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
    .icon("chevronright")
    .should("be.hidden");
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

// the button element that gets attributes is 2 levels up from the text
function findPickerItem(name) {
  return cy.findByText(name).parent().parent();
}
