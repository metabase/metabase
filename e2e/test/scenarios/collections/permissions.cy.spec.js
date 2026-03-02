import { onlyOn } from "@cypress/skip-test";

const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data.js";

import { displaySidebarChildOf } from "./helpers/e2e-collections-sidebar.js";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

describe("collection permissions", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/search*").as("search");
    H.restore();
  });

  describe("item management", () => {
    Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
      context(`${permission} access`, () => {
        userGroup.forEach((user) => {
          onlyOn(permission === "curate", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.signIn(user);
              });

              describe("create dashboard", () => {
                it("should offer to save dashboard to a currently opened collection", () => {
                  cy.visit("/collection/root");
                  H.navigationSidebar().within(() => {
                    displaySidebarChildOf("First collection");
                    cy.findByText("Second collection").click();
                  });
                  H.appBar().within(() => {
                    cy.icon("add").click();
                  });
                  // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                  cy.findByText("Dashboard").click();
                  cy.findByLabelText(/Which collection/).findByText(
                    "Second collection",
                  );
                });

                onlyOn(user === "admin", () => {
                  it("should offer to save dashboard to root collection from a dashboard page (metabase#16832)", () => {
                    cy.visit("/collection/root");
                    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                    cy.findByText("Orders in a dashboard").click();
                    H.appBar().within(() => {
                      cy.icon("add").click();
                    });
                    H.popover().findByText("Dashboard").click();
                    cy.findByLabelText(/Which collection/).findByText(
                      "Our analytics",
                    );
                  });
                });
              });

              describe("pin", () => {
                it("pinning should work properly for both questions and dashboards", () => {
                  cy.visit("/collection/root");
                  // Assert that we're starting from a scenario with no pins
                  cy.findByTestId("pinned-items").should("not.exist");

                  pinItem("Orders in a dashboard");
                  cy.findByTestId("collection-table")
                    .findByText("Orders in a dashboard")
                    .should("not.exist");

                  pinItem("Orders, Count");
                  cy.findByTestId("collection-table")
                    .findByText("Orders, Count")
                    .should("not.exist");

                  // Should see "pinned items" and items should be in that section
                  cy.findByTestId("pinned-items").within(() => {
                    cy.findByText("Orders in a dashboard");
                    cy.findByText("Orders, Count");
                  });
                });
              });

              describe("move", () => {
                it("should let a user move/undo move a question", () => {
                  move("Orders");
                });

                it("should let a user move/undo move a dashboard", () => {
                  move("Orders in a dashboard");
                });
              });

              describe("duplicate", () => {
                it("should be able to duplicate the dashboard without obstructions from the modal (metabase#15256)", () => {
                  duplicate("Orders in a dashboard");
                });
              });

              describe("archive", () => {
                it("should be able to archive/unarchive question (metabase#15253)", () => {
                  archiveUnarchive("Orders", "question");
                });

                it("should be able to archive/unarchive dashboard", () => {
                  archiveUnarchive("Orders in a dashboard", "dashboard");
                });

                it("should be able to archive/unarchive model", () => {
                  cy.skipOn(user === "nodata");
                  H.createNativeQuestion({
                    name: "Model",
                    type: "model",
                    native: {
                      query: "SELECT 1",
                    },
                  });
                  archiveUnarchive("Model", "model");
                });

                describe("archive page", () => {
                  it("should show archived items (metabase#15080, metabase#16617)", () => {
                    cy.visit("collection/root");
                    H.openCollectionItemMenu("Orders");
                    H.popover().within(() => {
                      cy.findByText("Move to trash").click();
                    });
                    cy.findByTestId("toast-undo").within(() => {
                      cy.findByText("Trashed question");
                      cy.icon("close").click();
                    });
                    H.navigationSidebar().within(() => {
                      cy.findByText("Trash").click();
                    });
                    cy.location("pathname").should("eq", "/trash");
                    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                    cy.findByText("Orders");
                  });
                });

                describe("collections", () => {
                  it("shouldn't be able to archive/edit root or personal collection", () => {
                    cy.visit("/collection/root");
                    cy.icon("edit").should("not.exist");
                    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                    cy.findByText("Your personal collection").click();
                    cy.icon("edit").should("not.exist");
                  });

                  it("archiving sub-collection should redirect to its parent", () => {
                    cy.request("GET", "/api/collection").then((xhr) => {
                      // We need to obtain the ID programatically
                      const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                        (collection) => collection.slug === "third_collection",
                      );

                      cy.intercept(
                        "PUT",
                        `/api/collection/${THIRD_COLLECTION_ID}`,
                      ).as("editCollection");

                      cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
                    });

                    H.openCollectionMenu();
                    H.popover().within(() =>
                      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- linter erroring for no reason
                      cy.findByText("Move to trash").click(),
                    );
                    H.modal().findByText("Move to trash").click();

                    cy.wait("@editCollection");

                    cy.findByTestId("archive-banner").should("exist");

                    H.navigationSidebar().within(() => {
                      cy.findByText("First collection");
                      cy.findByText("Second collection");
                      cy.findByText("Third collection").should("not.exist");
                    });

                    // While we're here, we can test unarchiving the collection as well
                    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                    cy.findByText("Trashed collection");
                    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                    cy.findByText("Undo").click();

                    cy.wait("@editCollection");

                    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                    cy.findByText(
                      "Sorry, you don’t have permission to see that.",
                    ).should("not.exist");
                    cy.findByTestId("archive-banner").should("not.exist");

                    // But unarchived collection is now visible in the sidebar
                    H.navigationSidebar().within(() => {
                      cy.findByText("Third collection");
                    });
                  });

                  it("visiting already archived collection by its ID shouldn't let you edit it (metabase#12489)", () => {
                    cy.request("GET", "/api/collection").then((xhr) => {
                      const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                        (collection) => collection.slug === "third_collection",
                      );
                      // Archive it
                      cy.request(
                        "PUT",
                        `/api/collection/${THIRD_COLLECTION_ID}`,
                        {
                          archived: true,
                        },
                      );

                      // What happens if we visit the archived collection by its id?
                      // This is the equivalent of hitting the back button but it also shows that the same UI is present whenever we visit the collection by its id
                      cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
                    });
                    cy.findByTestId("collection-name-heading")
                      .as("title")
                      .contains("Third collection");
                    // Creating new sub-collection at this point shouldn't be possible
                    // We shouldn't be able to change permissions for an archived collection (the root issue of #12489!)
                    cy.findByTestId("collection-menu").should("not.exist");

                    /**
                     *  We can take 2 routes from here - it will really depend on the design decision:
                     *    1. Edit icon shouldn't exist at all in which case some other call to drill-through menu/button should exist
                     *       notifying the user that this collection is archived and prompting them to unarchive it
                     *    2. Edit icon stays but with "Unarchive this item" ONLY in the menu
                     */

                    // Option 1
                    cy.icon("edit").should("not.exist");

                    // Option 2
                    // cy.icon("edit").click();
                    // popover().within(() => {
                    //   cy.findByText("Edit this collection").should("not.exist");
                    //   cy.findByText("Archive this collection").should(
                    //     "not.exist",
                    //   );
                    //   cy.findByText("Unarchive this collection");
                    // });
                  });

                  it("abandoning archive process should keep you in the same collection (metabase#15289)", () => {
                    cy.request("GET", "/api/collection").then((xhr) => {
                      const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                        (collection) => collection.slug === "third_collection",
                      );
                      cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
                      H.openCollectionMenu();
                      H.popover().within(() =>
                        cy.findByText("Move to trash").click(),
                      );
                      H.modal().findByText("Cancel").click();
                      cy.location("pathname").should(
                        "eq",
                        `/collection/${THIRD_COLLECTION_ID}-third-collection`,
                      );
                      cy.findByTestId("collection-name-heading")
                        .as("title")
                        .contains("Third collection");
                    });
                  });
                });

                function archiveUnarchive(item, expectedEntityName) {
                  cy.visit("/collection/root");
                  H.openCollectionItemMenu(item);
                  H.popover().within(() => {
                    cy.findByText("Move to trash").click();
                  });
                  cy.findByText(item).should("not.exist");
                  cy.findByText(`Trashed ${expectedEntityName}`);
                  cy.findByText("Undo").click();
                  cy.findByText(
                    "Sorry, you don’t have permission to see that.",
                  ).should("not.exist");
                  cy.findByText(item);
                }
              });
            });
          });

          onlyOn(permission === "view", () => {
            beforeEach(() => {
              cy.signIn(user);
            });

            it("should not show pins or a helper text (metabase#20043)", () => {
              cy.visit("/collection/root");

              // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Orders in a dashboard");
              cy.icon("pin").should("not.exist");
            });

            it("should be offered to duplicate dashboard in collections they have `read` access to", () => {
              const { first_name, last_name } = USERS[user];
              cy.visit("/collection/root");
              H.openCollectionItemMenu("Orders in a dashboard");
              H.popover().findByText("Duplicate").click();
              cy.findByTestId("collection-picker-button").should(
                "have.text",
                `${first_name} ${last_name}'s Personal Collection`,
              );
            });

            it("should not be able to use bulk actions on collection items (metabase#16490)", () => {
              cy.visit("/collection/root");

              // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Orders")
                .closest("tr")
                .within(() => {
                  cy.icon("table2").trigger("mouseover");
                  cy.findByRole("checkbox").should("not.exist");
                });

              // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Orders in a dashboard")
                .closest("tr")
                .within(() => {
                  cy.icon("dashboard").trigger("mouseover");
                  cy.findByRole("checkbox").should("not.exist");
                });
            });

            ["/", "/collection/root"].forEach((route) => {
              it("should not be offered to save dashboard in collections they have `read` access to (metabase#15281)", () => {
                const { first_name, last_name } = USERS[user];
                cy.visit(route);
                cy.icon("add").click();
                // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                cy.findByText("Dashboard").click();

                // Coming from the root collection, the initial offered collection will be "Our analytics" (read-only access)
                H.modal().within(() => {
                  cy.findByText(
                    `${first_name} ${last_name}'s Personal Collection`,
                  ).click();
                });

                cy.findByLabelText("Select a collection").within(() => {
                  cy.findByText("Read Only Tableton's Personal Collection");
                  // Test will fail on this step first
                  cy.findByText("First collection").should("not.exist");
                  // This is the second step that makes sure not even search returns collections with read-only access
                  cy.findByPlaceholderText("Search…").type("third{Enter}");

                  cy.wait("@search");
                  cy.findByText(/Loading/i).should("not.exist");
                  cy.findByText("Third collection").should("not.exist");
                });
              });
            });
          });
        });
      });
    });
  });

  it("should offer to save items to 'Our analytics' if user has a 'curate' access to it", () => {
    cy.signIn("normal");

    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from people");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByLabelText(/Where do you want to save this/).findByText(
      "Our analytics",
    );
  });

  it("should load the collection permissions admin pages", () => {
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("GET", "/api/collection/graph").as("permissionsGraph");
    cy.intercept("GET", "/api/permissions/group").as("permissionsGroups");

    cy.visit("/admin/permissions/collections");
    cy.get("main").findByText("Select a collection to see its permissions");

    cy.visit("/admin/permissions/collections/root");
    cy.wait(["@permissionsGraph", "@permissionsGroups"]);

    cy.findByTestId("permissions-editor").findByText(
      "Permissions for Our analytics",
    );
    cy.findByTestId("permission-table");

    cy.visit(`/admin/permissions/collections/${FIRST_COLLECTION_ID}`);
    cy.wait(["@permissionsGraph", "@permissionsGroups"]);
    cy.findByTestId("permissions-editor").findByText(
      "Permissions for First collection",
    );
    cy.findByTestId("permission-table");

    H.sidebar().findByText("Usage analytics").click();
    cy.findByTestId("permissions-editor").findByText(
      "Permissions for Usage analytics",
    );
    cy.findByTestId("permission-table");
  });

  it("should show the new collection button in a sidebar even to users without collection access", () => {
    cy.intercept("POST", "/api/collection").as("createCollection");

    cy.signIn("nocollection");
    cy.visit("/");
    H.navigationSidebar()
      .findByLabelText("Create a new collection")
      .should("be.visible")
      .click();

    cy.findByTestId("new-collection-modal").within(() => {
      cy.findByLabelText("Name").type("Foo");
      cy.log(
        "The only possible location to save the new collection is this user's personal collection",
      );
      cy.findByTestId("collection-picker-button").should(
        "contain",
        "No Collection Tableton's Personal Collection",
      );
      cy.button("Create").click();
      cy.wait("@createCollection");
    });
    cy.location("pathname").should("match", /^\/collection\/\d+-foo/);
  });
});

function clickButton(name) {
  cy.findByRole("button", { name }).should("not.be.disabled").click();
}

function pinItem(item) {
  H.openCollectionItemMenu(item);
  H.popover().icon("pin").click();
}

function exposeChildrenFor(collectionName) {
  H.navigationSidebar()
    .findByText(collectionName)
    .parentsUntil("[data-testid=sidebar-collection-link-root]")
    .find(".Icon-chevronright")
    .eq(0) // there may be more nested icons, but we need the top level one
    .click();
}

function move(item) {
  cy.visit("/collection/root");
  H.openCollectionItemMenu(item);
  H.popover().findByText("Move").click();
  H.entityPickerModal().within(() => {
    cy.findByText(`Move "${item}"?`);
    // Let's move it into a nested collection
    cy.findByText("First collection").click();
    cy.findByText("Second collection").click();
    cy.button("Move").click();
  });

  cy.findByText(item).should("not.exist");
  // Make sure item was properly moved to a correct sub-collection
  exposeChildrenFor("First collection");
  cy.findByText("Second collection").click();
  cy.findByText(item);
  // Undo the whole thing
  cy.findByText(/Moved (question|dashboard)/);
  cy.findByText("Undo").click();
  cy.findByText(item).should("not.exist");
  cy.visit("/collection/root");
  cy.findByText(item);
}

function duplicate(item) {
  cy.visit("/collection/root");
  H.openCollectionItemMenu(item);
  cy.findByText("Duplicate").click();
  H.modal()
    .as("modal")
    .within(() => {
      clickButton("Duplicate");
      cy.findByText("Failed").should("not.exist");
    });
  cy.get("@modal").should("not.exist");
  cy.findByText(`${item} - Duplicate`);
}
