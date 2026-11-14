const { H } = cy;
import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { CollectionId } from "metabase-types/api";

const { ALL_USERS_GROUP } = USER_GROUPS;

const CURATE_USERS = ["admin", "normal", "nodata"] as const;

type CurateUser = (typeof CURATE_USERS)[number];

describe("collection permissions", () => {
  beforeEach(() => {
    H.restore();
  });

  describe("item management", () => {
    context("curate access", () => {
      CURATE_USERS.forEach((user: CurateUser) => {
        describe(`${user} user`, () => {
          beforeEach(() => {
            cy.signIn(user);
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

          if (user !== "nodata") {
            it("should cancel, trash, and undo trashing a sub-collection, and not allow editing it once archived (metabase#15289, metabase#12489)", () => {
              cy.request("GET", "/api/collection").then((xhr) => {
                // We need to obtain the ID programatically
                const { id: THIRD_COLLECTION_ID } = xhr.body.find(
                  (collection: { slug: string }) =>
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
                cy.request("PUT", `/api/collection/${THIRD_COLLECTION_ID}`, {
                  archived: true,
                });
                cy.visit(`/collection/${THIRD_COLLECTION_ID}`);
              });
              cy.findByTestId("collection-name-heading").contains(
                "Third collection",
              );
              cy.findByTestId("archive-banner").should("be.visible");
              // We shouldn't be able to change permissions for an archived collection
              cy.findByTestId("collection-menu").should("not.exist");
            });
          }
        });
      });
    });

    context("view access", () => {
      beforeEach(() => {
        cy.signIn("readonly");
      });

      it("should not be offered to save dashboard in collections they have `read` access to (metabase#15281)", () => {
        const { first_name, last_name } = USERS.readonly;
        cy.intercept("GET", "/api/search*").as("search");
        cy.visit("/collection/root");
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

describe("issue 20911", () => {
  const COLLECTION_ACCESS_PERMISSION_INDEX = 0;
  const FIRST_COLLECTION = "First collection";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/collection/graph").as("getGraph");
  });

  it("should allow to change sub-collections permissions after access change (metabase#20911)", () => {
    cy.visit("/collection/root/permissions");
    cy.wait("@getGraph");
    H.assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "Curate"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);
    H.modifyPermission(
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      // @ts-expect-error js function being used in ts file
      false,
    );
    H.modifyPermission(
      "collection",
      COLLECTION_ACCESS_PERMISSION_INDEX,
      "No access",
      // @ts-expect-error js function being used in ts file
      true,
    );
    H.modal().within(() => {
      cy.button("Save").click();
    });

    H.navigationSidebar().within(() => {
      cy.findByText(FIRST_COLLECTION).click();
    });
    H.getCollectionActions().within(() => {
      cy.icon("ellipsis").click();
    });
    H.popover().within(() => {
      cy.icon("lock").click();
    });
    H.assertPermissionTable([
      ["Administrators", "Curate"],
      ["All Users", "No access"],
      ["collection", "No access"],
      ["data", "No access"],
      ["nosql", "No access"],
      ["readonly", "View"],
    ]);

    cy.signInAsNormalUser();
    cy.visit("/collection/root");
    cy.get("main").findByText("You don't have permissions to do that.");

    cy.visit(`/collection/${FIRST_COLLECTION_ID}`);
    cy.get("main").findByText("Sorry, you don’t have permission to see that.");
  });
});

describe("issue 58231", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should allow to edit permissions for Usage Analytics collection (metabase#58231)", () => {
    cy.visit("/collection/2-usage-analytics");

    cy.findByTestId("collection-menu")
      .findByLabelText("Edit permissions")
      .should("be.visible")
      .click();

    H.modal()
      .findByText("Permissions for Usage analytics")
      .should("be.visible");
  });
});

describe("issue 56567", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  const withTestCollections = (
    callback: (
      collectionAId: CollectionId,
      collectionBId: CollectionId,
    ) => void,
  ) => {
    H.createCollection({
      name: "A",
    }).then(({ body: collectionA }) => {
      const collectionAId = collectionA.id;

      H.createCollection({
        name: "B",
        parent_id: collectionA.id,
      }).then(({ body: collectionB }) => {
        const collectionBId = collectionB.id;
        callback(collectionAId, collectionBId);
      });
    });
  };

  const getTestPermissionsTable = (allUsersPermission: string) => [
    ["Administrators", "Curate"],
    ["All Users", allUsersPermission],
    ["collection", "Curate"],
    ["data", "No access"],
    ["Data Analysts", "No access"],
    ["nosql", "No access"],
    ["readonly", "View"],
  ];

  it("should propagate permission to sub-collections only when 'Also change sub-collections' is checked (metabase#56567)", () => {
    withTestCollections((collectionAId, collectionBId) => {
      cy.intercept("PUT", "/api/collection/graph?skip-graph=true").as(
        "savePermissions",
      );

      cy.log(
        "should NOT propagate when 'Also change sub-collections' is unchecked",
      );
      cy.visit(`/admin/permissions/collections/${collectionBId}`);

      H.assertPermissionTable(getTestPermissionsTable("No access"));

      cy.visit(`/collection/${collectionAId}-a/permissions`);

      // opens up the permissions select
      H.getPermissionRowPermissions("All Users").click();

      // selected desired permission without checking 'Also change sub-collections'
      H.popover().findByText("View").click();

      // opens up the permissions select again
      H.getPermissionRowPermissions("All Users").click();

      // ensures the toggle is not checked
      H.popover().findByRole("switch").should("not.be.checked");

      cy.button("Save").click();
      cy.wait("@savePermissions");

      // Checks permissions for collection A is set to "View" as expected
      cy.visit(`/admin/permissions/collections/${collectionAId}`);
      H.assertPermissionTable(getTestPermissionsTable("View"));

      // Check the permission set to collection A was NOT propagated to collection B
      cy.visit(`/admin/permissions/collections/${collectionBId}`);
      H.assertPermissionTable(getTestPermissionsTable("No access"));

      cy.log("should propagate when 'Also change sub-collections' is checked");
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [collectionAId]: "none" },
      });

      cy.visit(`/admin/permissions/collections/${collectionAId}`);

      H.assertPermissionTable(getTestPermissionsTable("No access"));

      cy.visit(`/admin/permissions/collections/${collectionBId}`);

      H.assertPermissionTable(getTestPermissionsTable("No access"));

      cy.visit(`/collection/${collectionAId}-a/permissions`);

      // opens up the permissions select
      H.getPermissionRowPermissions("All Users").click();

      // checks the 'Also change sub-collections' toggle
      H.popover().findByRole("switch").click({ force: true });
      H.popover().findByRole("switch").should("be.checked");

      // selected desired permission
      H.popover().findByText("View").click();

      // opens up the permissions select again
      H.getPermissionRowPermissions("All Users").click();

      // ensures the toggle is still checked
      H.popover().findByRole("switch").should("be.checked");

      cy.button("Save").click();
      cy.wait("@savePermissions");

      // Checks permissions for collection A is set to "View" as expected
      cy.visit(`/admin/permissions/collections/${collectionAId}`);
      H.assertPermissionTable(getTestPermissionsTable("View"));

      // Check the permission set to collection A was propagated to collection B
      cy.visit(`/admin/permissions/collections/${collectionBId}`);
      H.assertPermissionTable(getTestPermissionsTable("View"));
    });
  });
});

function clickButton(name: string) {
  cy.findByRole("button", { name }).should("not.be.disabled").click();
}

function pinItem(item: string) {
  H.openCollectionItemMenu(item);
  H.popover().icon("pin").click();
}

function move(item: string) {
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

function duplicate(item: string) {
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

function archiveUnarchive(item: string, expectedEntityName: string) {
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
