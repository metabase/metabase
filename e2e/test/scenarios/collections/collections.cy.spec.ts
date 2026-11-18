import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID, USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  FIRST_COLLECTION_ENTITY_ID,
  FIRST_COLLECTION_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { DataPermissionValue } from "metabase-types/api/permissions";

const { nocollection } = USERS;
const { DATA_GROUP } = USER_GROUPS;
const { ORDERS, ORDERS_ID, FEEDBACK_ID } = SAMPLE_DATABASE;

describe("scenarios > collection defaults", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/collection/tree**").as("getTree");
    cy.intercept("GET", "/api/collection/*/items?**").as("getCollectionItems");
  });

  describe("new collection button", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should show the new collection button in the root collection", () => {
      cy.intercept("POST", "/api/collection").as("createCollection");

      visitRootCollection();
      cy.findByTestId("collection-menu")
        .findByLabelText("Create a new collection")
        .click();

      cy.log("Track the collection initiation from the header");
      H.expectUnstructuredSnowplowEvent({
        event: "plus_button_clicked",
        triggered_from: "collection-header",
      });
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByLabelText("Name").type("MCL");
        cy.findByTestId("collection-picker-button").should(
          "contain",
          "Our analytics",
        );
        cy.button("Create").click();
        cy.wait("@createCollection");
      });
      cy.location("pathname").should("match", /^\/collection\/\d+-mcl/);
      cy.findByTestId("collection-empty-state").should("be.visible");

      cy.log(
        "Newly created collection should also have the new collection button",
      );
      cy.findByTestId("collection-menu")
        .findByLabelText("Create a new collection")
        .should("be.visible");

      cy.log("Track the collection initiation from the main navbar");
      H.navigationSidebar().findByLabelText("Create a new collection").click();
      cy.findByTestId("new-collection-modal").should("be.visible");
      H.expectUnstructuredSnowplowEvent({
        event: "plus_button_clicked",
        triggered_from: "collection-nav",
      });
    });
  });

  describe("new collection modal", () => {
    it("should be usable on small screens", () => {
      const COLLECTIONS_COUNT = 5;
      _.times(COLLECTIONS_COUNT, (index) => {
        cy.request("POST", "/api/collection", {
          name: `Collection ${index + 1}`,
          parent_id: null,
        });
      });

      cy.visit("/");

      cy.viewport(800, 500);

      H.startNewCollectionFromSidebar();
      cy.findByTestId("new-collection-modal").within(() => {
        cy.findByPlaceholderText("My new fantastic collection").type(
          "Test collection",
          { force: true },
        );
        cy.findByLabelText("Description").type("Test collection description");
        cy.findByTestId("collection-picker-button")
          .findByText("Our analytics")
          .click();
      });

      H.pickEntity({
        path: ["Our analytics", `Collection ${COLLECTIONS_COUNT}`],
        select: true,
      });

      cy.findByTestId("new-collection-modal").button("Create").click();

      cy.findByTestId("collection-name-heading").should(
        "have.text",
        "Test collection",
      );
    });
  });

  describe("Collection related issues reproductions", () => {
    it("should handle moving a question when you don't have access to entire collection path (metabase#44316)", () => {
      H.createCollection({
        name: "Collection A",
      }).then(({ body: collectionA }) => {
        H.createCollection({
          name: "Collection B",
          parent_id: collectionA.id,
        }).then(({ body: collectionB }) => {
          H.createCollection({
            name: "Collection C",
            parent_id: collectionB.id,
          }).then(({ body: collectionC }) => {
            H.createCollection({
              name: "Collection D",
              parent_id: collectionC.id,
            }).then(({ body: collectionD }) => {
              H.createCollection({
                name: "Collection E",
                parent_id: collectionD.id,
              }).then(({ body: collectionE }) => {
                cy.updatePermissionsGraph({
                  [ALL_USERS_GROUP_ID]: {
                    [SAMPLE_DB_ID]: {
                      "view-data": DataPermissionValue.UNRESTRICTED,
                      "create-queries":
                        DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
                    },
                  },
                });
                cy.updateCollectionGraph({
                  [ALL_USERS_GROUP_ID]: {
                    root: "none" as const,
                    [collectionA.id]: "none" as const,
                    [collectionB.id]: "write" as const,
                    [collectionC.id]: "none" as const,
                    [collectionD.id]: "none" as const,
                    [collectionE.id]: "write" as const,
                  },
                });
                cy.signIn("none");
                H.createQuestion(
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
      H.popover().findByText("Move").click();
      H.entityPickerModalItem(1, "Collection B").should("exist");
      H.entityPickerModalItem(2, "Collection E").should("exist");

      H.entityPickerModal().should(
        "not.contain.text",
        "You don't have permissions to do that.",
      );
    });

    it("should be able to drag an item into a sub-collection shown in the items table (metabase#37329)", () => {
      H.createNativeQuestion({
        name: "Native question with invalid parameters",
        native: { query: "select 1 --[[]]", "template-tags": {} },
      });
      H.createDocument({
        name: "Quarterly Notes",
        collection_id: null,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Notes" }],
              attrs: { _id: "1" },
            },
          ],
        },
      });
      H.createQuestion({
        name: "Count of orders",
        type: "metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
      });

      visitRootCollection();

      cy.log(
        "Collection items are listed even if one question has invalid parameters (metabase#25543)",
      );
      cy.findByTestId("collection-table").within(() => {
        cy.findByText("Native question with invalid parameters").should(
          "be.visible",
        );
        cy.findByText("Orders in a dashboard").should("be.visible");
      });

      cy.log("Drag a question into the sub-collection row");
      cy.findByTestId("collection-table").within(() => {
        cy.findByText("Orders").as("dragSubject");
        cy.findByText("First collection").as("dropTarget");
      });

      H.dragAndDrop("dragSubject", "dropTarget");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Moved question");
      cy.findByTestId("collection-table")
        .findByText("Orders")
        .should("not.exist");

      cy.log("Drag a document into the sub-collection row");
      cy.findByTestId("collection-table").within(() => {
        cy.findByText("Quarterly Notes").as("documentDragSubject");
        cy.findByText("First collection").as("documentDropTarget");
      });

      H.dragAndDrop("documentDragSubject", "documentDropTarget");

      cy.findByTestId("collection-table")
        .findByText("Quarterly Notes")
        .should("not.exist");

      cy.log("Drag a metric into the sub-collection row");
      cy.findByTestId("collection-table").within(() => {
        cy.findByText("Count of orders").as("metricDragSubject");
        cy.findByText("First collection").as("metricDropTarget");
      });

      H.dragAndDrop("metricDragSubject", "metricDropTarget");

      cy.findByTestId("collection-table")
        .findByText("Count of orders")
        .should("not.exist");

      H.visitCollection(FIRST_COLLECTION_ID);
      cy.findByTestId("collection-table").findByText("Orders");
      cy.findByTestId("collection-table").findByText("Quarterly Notes");
      cy.findByTestId("collection-table").findByText("Count of orders");

      cy.log("Drag an item to the root collection (metabase#16498)");
      cy.findByTestId("collection-table")
        .findByText("Orders")
        .as("rootDragSubject");
      H.navigationSidebar().findByText("Our analytics").as("rootDropTarget");

      H.dragAndDrop("rootDragSubject", "rootDropTarget");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Moved question");
      cy.findByTestId("collection-table")
        .findByText("Orders")
        .should("not.exist");

      visitRootCollection();
      cy.findByTestId("collection-table").findByText("Orders");
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
                groups[DATA_GROUP] = {};
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

        H.navigationSidebar().within(() => {
          cy.findByText("Child").should("be.visible");
          cy.findByText("Your personal collection").should("be.visible");
          cy.findByText("Our analytics").should("not.exist");
          cy.findByText("Parent").should("not.exist");
        });

        // Even if user tries to navigate directly to the root collection, we have to make sure its content is not shown
        cy.visit("/collection/root");
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("You don't have permissions to do that.");
      });

      it("should be able to choose a child collection when saving a question (metabase#14052)", () => {
        H.openOrdersTable();
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Save").click();
        // Click to choose which collection should this question be saved to
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText(revokedUsersPersonalCollectionName).click();
        H.pickEntity({ path: [revokedUsersPersonalCollectionName] });
        H.pickEntity({ path: ["Collections", "Child"] });
        H.entityPickerModal()
          .button("Select this collection")
          .should("be.enabled");
        cy.log("Reported failing from v0.34.3");
        cy.findByTestId("entity-picker-modal")
          .findByText("Parent")
          .should("not.exist");
      });
    });

    it("moving collections should update the UI (metabase#14280, metabase#14482)", () => {
      const NEW_COLLECTION = "New collection";

      // Create New collection within `Our analytics`
      H.createCollection({
        name: NEW_COLLECTION,
        parent_id: null,
      });

      cy.log(
        "when nested child collection is moved to the root collection (metabase#14482)",
      );

      H.visitCollection(SECOND_COLLECTION_ID);

      H.openCollectionMenu();
      H.popover().findByText("Move").click();

      // we need to do this manually because we need to await the correct number of api requests to keep this from flaking

      H.entityPickerModal().within(() => {
        cy.findByTestId("loading-indicator").should("not.exist");
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

      H.entityPickerModal().should("not.exist");
      cy.wait("@getTree");

      H.navigationSidebar().within(() => {
        ensureCollectionHasNoChildren("First collection");

        // Should be expanded automatically
        ensureCollectionIsExpanded("Second collection");
        // Move into the "Third collection"
        cy.findByText("Third collection").click();
      });

      cy.log(
        "should show moved collection inside a folder tree structure (metabase#14280)",
      );

      H.moveOpenedCollectionTo(NEW_COLLECTION);
      cy.wait("@getTree");

      H.navigationSidebar().within(() => {
        ensureCollectionHasNoChildren("Second collection");

        ensureCollectionIsExpanded(NEW_COLLECTION, {
          children: ["Third collection"],
        });
      });
    });

    describe("bulk actions", () => {
      describe("move", () => {
        it("should be possible to bulk move items and undo", () => {
          cy.visit("/collection/root");
          selectItemUsingCheckbox("Orders");

          cy.findByTestId("toast-card").button("Move").click();

          H.entityPickerModal().within(() => {
            cy.findByText("First collection").click();
            cy.button("Move").click();
          });

          H.getUnpinnedSection().findByText("Orders").should("not.exist");
          cy.findByTestId("toast-card").should("not.exist");

          // Check that items were actually moved
          H.navigationSidebar().findByText("First collection").click();
          H.getUnpinnedSection().findByText("Orders").should("be.visible");

          cy.findByTestId("toast-undo").findByText("Undo").click();
          H.navigationSidebar().findByText("Our analytics").click();
          H.getUnpinnedSection().findByText("Orders").should("be.visible");
          cy.findByTestId("toast-undo").should("not.exist");
        });
      });
    });
  });
});

describe("scenarios > collection items listing", () => {
  const TEST_QUESTION_QUERY = {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
    ],
  };

  const PAGE_SIZE = 25;
  const ADDED_QUESTIONS = 25;
  // The "First collection" sub-collection, the dashboard and the questions
  const TOTAL_ITEMS = 1 + 1 + ADDED_QUESTIONS;

  function archiveAll() {
    cy.request("GET", "/api/collection/root/items").then((response) => {
      response.body.data.forEach(
        ({ model, id }: { model: string; id: number }) => {
          if (model !== "collection") {
            cy.request(
              "PUT",
              `/api/${model === "dataset" ? "card" : model}/${id}`,
              { archived: true },
            );
          }
        },
      );
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should page, sort, search and filter the items of a collection against the backend", () => {
    archiveAll();
    H.createDashboard({
      name: "Revenue dashboard",
      collection_position: null,
    });
    _.times(ADDED_QUESTIONS, (i) =>
      H.createQuestion({
        name: `Question ${i + 1}`,
        collection_position: null,
        query: TEST_QUESTION_QUERY,
      }),
    );

    cy.intercept("GET", "/api/collection/root/items?*").as(
      "getCollectionItems",
    );
    cy.visit("/collection/root");
    cy.wait(["@getCollectionItems", "@getCollectionItems"]);

    cy.log("pagination");
    cy.findByTestId("pagination-total").should("have.text", TOTAL_ITEMS);
    cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);
    cy.findByLabelText("Next page").click();
    cy.findAllByTestId("collection-entry").should(
      "have.length",
      TOTAL_ITEMS - PAGE_SIZE,
    );

    cy.log("sorting by type lists dashboards first and resets pagination");
    cy.findByTestId("items-table-head").findByText("Type").click();
    cy.findAllByTestId("collection-entry").should("have.length", PAGE_SIZE);
    cy.findAllByTestId("collection-entry-name")
      .first()
      .should("have.text", "Revenue dashboard");

    cy.log("search");
    cy.findByLabelText("Search items in this collection").type("revenue");
    cy.findByTestId("collection-table")
      .should("contain", "Revenue dashboard")
      .and("not.contain", "Question 1");
    cy.findByLabelText("Clear search").click();
    cy.findByTestId("collection-table").should("contain", "Question 1");

    cy.log("type filter");
    cy.findByRole("button", { name: "Filter" }).click();
    H.popover().findByLabelText("Collection").click();
    cy.findByTestId("collection-table")
      .should("contain", "First collection")
      .and("not.contain", "Revenue dashboard")
      .and("not.contain", "Question 1");
  });

  it("should show a tooltip for a last editor email that the real column truncates", () => {
    // Jest covers the email fallback and the tooltip logic with simulated
    // widths; only a browser can tell whether the column's CSS truncates it.
    const LONG_EMAIL = "averyverylongemail@veryverylongdomain.com";

    cy.intercept(
      "GET",
      "/api/collection/root/items?models=dashboard**",
      (req) => {
        req.on("response", (res) => {
          const data = [...res.body.data];
          data[0] = {
            ...data[0],
            "last-edit-info": {
              id: 1,
              first_name: null,
              last_name: null,
              email: LONG_EMAIL,
              timestamp: "2022-07-05T07:31:09.054-07:00",
            },
          };
          res.send({ ...res.body, data });
        });
      },
    ).as("getCollectionItems");
    cy.visit("/collection/root");
    cy.wait("@getCollectionItems");

    cy.findByTestId("collection-table")
      .findByText(LONG_EMAIL)
      .trigger("mouseenter");
    cy.findByRole("tooltip").should("be.visible").and("contain", LONG_EMAIL);
  });
});

describe("scenarios > collections > entity id support", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("/collection/entity/${entity_id} and /collection/entity/${entity_id}/move should redirect to /collection/${id} and /collection/${id}/move", () => {
    cy.log("/collection/entity/${entity_id}");
    cy.visit(`/collection/entity/${FIRST_COLLECTION_ENTITY_ID}`);
    cy.url().should("contain", `/collection/${FIRST_COLLECTION_ID}`);

    // Making sure the collection loads
    H.main().findByText("First collection").should("be.visible");

    cy.log("/collection/entity/${entity_id}/move");
    cy.visit(`/collection/entity/${FIRST_COLLECTION_ENTITY_ID}/move`);
    cy.url().should("contain", `/collection/${FIRST_COLLECTION_ID}/move`);

    H.main().findByText("First collection").should("be.visible");
    H.modal().findByText('Move "First collection"?').should("be.visible");
  });
});

function getRowCheckbox(item: string) {
  return cy.findByText(item).closest("tr").findByRole("checkbox");
}

function selectItemUsingCheckbox(item: string) {
  getRowCheckbox(item).closest("button").click();
}

function visitRootCollection() {
  cy.intercept("GET", "/api/collection/root/items?**").as(
    "fetchRootCollectionItems",
  );

  cy.visit("/collection/root");

  cy.wait(["@fetchRootCollectionItems", "@fetchRootCollectionItems"]);
}

function ensureCollectionHasNoChildren(collection: string) {
  cy.findByText(collection)
    .closest("li")
    .icon("chevronright")
    .should("be.hidden");
}

function ensureCollectionIsExpanded(
  collection: string,
  { children = [] }: { children?: string[] } = {},
) {
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
        children.forEach((child) => {
          cy.findByText(child);
        });
      });
  }
}

// the button element that gets attributes is 2 levels up from the text
function findPickerItem(name: string) {
  return cy.findByText(name).closest("a");
}
