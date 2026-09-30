const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data.js";
import { onlyOn } from "e2e/support/helpers/e2e-skip-test-helpers";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
};

describe("collection permissions", () => {
  beforeEach(() => {
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
                onlyOn(user !== "nodata", () => {
                  it("should offer to save dashboard to a currently opened collection", () => {
                    cy.visit("/collection/root");
                    H.displaySidebarChildOf("First collection");
                    H.navigationSidebar()
                      .findByText("Second collection")
                      .click();
                    H.appBar().within(() => {
                      cy.icon("add").click();
                    });
                    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
                    cy.findByText("Dashboard").click();
                    cy.findByLabelText(/Which collection/).findByText(
                      "Second collection",
                    );
                  });
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

              it(`should move, duplicate${user === "admin" ? " and archive" : ", archive and pin"} questions and dashboards (metabase#15256, metabase#15253, metabase#15080, metabase#16617)`, () => {
                cy.log("Move and undo moving a question and a dashboard");
                move("Orders");
                move("Orders in a dashboard");

                cy.log(
                  "Duplicate the dashboard without obstructions from the modal (metabase#15256)",
                );
                duplicate("Orders in a dashboard");

                cy.log("Archive and unarchive items");
                archiveUnarchive("Orders", "question");
                archiveUnarchive("Orders in a dashboard", "dashboard");

                if (user !== "nodata") {
                  H.createNativeQuestion({
                    name: "Model",
                    type: "model",
                    native: {
                      query: "SELECT 1",
                    },
                  });
                  archiveUnarchive("Model", "model");
                }

                cy.log(
                  "Trashed items show up in the trash (metabase#15080, metabase#16617)",
                );
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

                if (user !== "admin") {
                  cy.log("Pin a question and a dashboard");
                  cy.visit("/collection/root");
                  // Assert that we're starting from a scenario with no pins
                  cy.findByTestId("pinned-items").should("not.exist");

                  pinItem("Orders in a dashboard");
                  cy.findByTestId("pinned-items")
                    .findByText("Orders in a dashboard")
                    .should("be.visible");

                  pinItem("Orders, Count");
                  cy.findByTestId("pinned-items")
                    .findByText("Orders, Count")
                    .should("be.visible");

                  // Pinned items also stay in the contents list
                  cy.findByTestId("collection-table").within(() => {
                    cy.findByText("Orders in a dashboard");
                    cy.findByText("Orders, Count");
                  });
                }
              });

              describe("archive", () => {
                onlyOn(user !== "nodata", () => {
                  describe("collections", () => {
                    it("shouldn't be able to archive/edit root or personal collection", () => {
                      const { first_name, last_name } = USERS[user];

                      cy.visit("/collection/root");
                      cy.findByTestId("collection-name-heading").should(
                        "contain",
                        "Our analytics",
                      );
                      if (user === "admin") {
                        H.openCollectionMenu();
                        H.popover().within(() => {
                          cy.findByText("Edit permissions").should(
                            "be.visible",
                          );
                          cy.findByText("Move").should("not.exist");
                          cy.findByText("Move to trash").should("not.exist");
                        });
                      } else {
                        H.getCollectionActions()
                          .findByLabelText("More info")
                          .should("be.visible");
                        H.getCollectionActions()
                          .icon("ellipsis")
                          .should("not.exist");
                      }

                      H.navigationSidebar()
                        .findByText("Your personal collection")
                        .click();
                      cy.findByTestId("collection-name-heading").should(
                        "contain",
                        `${first_name} ${last_name}'s Personal Collection`,
                      );
                      H.getCollectionActions()
                        .findByLabelText("More info")
                        .should("be.visible");
                      H.getCollectionActions()
                        .icon("ellipsis")
                        .should("not.exist");
                    });

                    it("should cancel, trash, and undo trashing a sub-collection, and not allow editing it once archived (metabase#15289, metabase#12489)", () => {
                      cy.request("GET", "/api/collection").then((xhr) => {
                        // We need to obtain the ID programatically
                        const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                          (collection) =>
                            collection.slug === "third_collection",
                        );

                        cy.intercept(
                          "PUT",
                          `/api/collection/${THIRD_COLLECTION_ID}`,
                        ).as("editCollection");

                        cy.visit(`/collection/${THIRD_COLLECTION_ID}`);

                        cy.log(
                          "Abandoning the trash process keeps you in the same collection (metabase#15289)",
                        );
                        H.openCollectionMenu();
                        H.popover().within(() =>
                          cy.findByText("Move to trash").click(),
                        );
                        H.modal().findByText("Cancel").click();
                        H.modal().should("not.exist");
                        cy.location("pathname").should(
                          "eq",
                          `/collection/${THIRD_COLLECTION_ID}-third-collection`,
                        );
                        cy.findByTestId("collection-name-heading").contains(
                          "Third collection",
                        );

                        H.openCollectionMenu();
                        H.popover().within(() =>
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

                        cy.findByText("Trashed collection");

                        cy.findByText("Undo").click();

                        cy.wait("@editCollection");

                        cy.findByText(
                          "Sorry, you don’t have permission to see that.",
                        ).should("not.exist");
                        cy.findByTestId("archive-banner").should("not.exist");

                        // But unarchived collection is now visible in the sidebar
                        H.navigationSidebar().within(() => {
                          cy.findByText("Third collection");
                        });

                        cy.log(
                          "Visiting an archived collection by its ID shouldn't let you edit it (metabase#12489)",
                        );
                        cy.request(
                          "PUT",
                          `/api/collection/${THIRD_COLLECTION_ID}`,
                          {
                            archived: true,
                          },
                        );
                        cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
                      });
                      cy.findByTestId("collection-name-heading").contains(
                        "Third collection",
                      );
                      cy.findByTestId("archive-banner").should("be.visible");
                      // We shouldn't be able to change permissions for an archived collection
                      cy.findByTestId("collection-menu").should("not.exist");
                    });
                  });
                });
              });
            });
          });

          onlyOn(permission === "view", () => {
            beforeEach(() => {
              cy.signIn(user);
            });

            it("should not offer bulk actions or pins, but should offer to duplicate dashboard in collections they have `read` access to (metabase#16490, metabase#20043)", () => {
              const { first_name, last_name } = USERS[user];
              cy.visit("/collection/root");

              cy.log("No bulk actions on collection items (metabase#16490)");
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

              cy.log("No option to pin items (metabase#20043)");
              H.openCollectionItemMenu("Orders in a dashboard");
              H.popover().within(() => {
                cy.findByText("Duplicate").should("be.visible");
                cy.findByText("Pin this").should("not.exist");
                cy.findByText("Duplicate").click();
              });
              cy.findByTestId("collection-picker-button").should(
                "have.text",
                `${first_name} ${last_name}'s Personal Collection`,
              );
            });

            ["/", "/collection/root"].forEach((route) => {
              it(`should not be offered to save dashboard in collections they have \`read\` access to from ${route} (metabase#15281)`, () => {
                const { first_name, last_name } = USERS[user];
                cy.intercept("GET", "/api/search*").as("search");
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
                  // Enter would confirm the selected collection and close the picker
                  cy.findByPlaceholderText("Search…").type("third");

                  cy.wait("@search");
                  cy.findByText("We didn't find anything").should("be.visible");
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
  H.displaySidebarChildOf("First collection");
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
  cy.intercept("POST", "/api/dashboard/*/copy").as("copyDashboard");
  cy.visit("/collection/root");
  H.openCollectionItemMenu(item);
  cy.findByText("Duplicate").click();
  H.modal()
    .as("modal")
    .within(() => {
      clickButton("Duplicate");
      cy.wait("@copyDashboard");
      cy.findByText("Failed").should("not.exist");
    });
  cy.get("@modal").should("not.exist");
  cy.findByText(`${item} - Duplicate`);
}

function archiveUnarchive(item, expectedEntityName) {
  cy.visit("/collection/root");
  H.openCollectionItemMenu(item);
  H.popover().within(() => {
    cy.findByText("Move to trash").click();
  });
  cy.findByText(item).should("not.exist");
  cy.findByText(`Trashed ${expectedEntityName}`);
  cy.findByText("Undo").click();
  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
  cy.findByText(item);
}
