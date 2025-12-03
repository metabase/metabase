const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { createLibraryWithItems } from "e2e/support/test-library-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

const SETTINGS_INDEX = 0;
const MONITORING_INDEX = 1;
const SUBSCRIPTIONS_INDEX = 2;
const DATA_STUDIO_INDEX = 3;

const NORMAL_USER_ID = 2;

describe("scenarios > admin > permissions > application", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("shows permissions help", () => {
    cy.visit("/admin/permissions/application");
    cy.get("main").within(() => {
      cy.findByText("Permissions help").as("permissionHelpButton").click();
      cy.get("@permissionHelpButton").should("not.exist");
    });

    cy.findByLabelText("Permissions help reference").within(() => {
      cy.findAllByText("Applications permissions");

      cy.findByText(
        "Application settings are useful for granting groups access to some, but not all, of Metabase’s administrative features.",
      );
      cy.findByLabelText("Close").click();
    });
  });

  describe("subscriptions permission", () => {
    describe("revoked", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        H.modifyPermission("All Users", SUBSCRIPTIONS_INDEX, "No");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        createSubscription(NORMAL_USER_ID);

        cy.signInAsNormalUser();
      });

      it("revokes ability to create subscriptions and alerts and manage them", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.openSharingMenu();
        H.sharingMenu()
          .findByText(/subscri/i)
          .should("not.exist");

        H.visitQuestion(ORDERS_QUESTION_ID);
        H.tableInteractive().should("be.visible");
        H.sharingMenuButton().should("be.disabled");

        cy.visit("/account/notifications");
        cy.findByTestId("notifications-list").within(() => {
          cy.icon("close").should("not.exist");
        });
      });
    });

    describe("granted", () => {
      it("gives ability to create dashboard subscriptions and question alerts", () => {
        H.setupSMTP();
        cy.signInAsNormalUser();

        cy.log("Set up a dashboard subscription");
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.openSharingMenu(/subscriptions/i);
        H.sidebar().findByText("Email this dashboard").should("exist");

        cy.log("Create a question alert");
        H.visitQuestion(ORDERS_QUESTION_ID);
        cy.findByLabelText("Move, trash, and more…").click();
        H.popover().findByText("Create an alert").click();
        H.modal().findByText("New alert").should("be.visible");
      });
    });
  });

  describe("monitoring permission", () => {
    describe("granted", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        H.modifyPermission("All Users", MONITORING_INDEX, "Yes");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        H.createNativeQuestion(
          {
            name: "broken_question",
            native: { query: "select * from broken_question" },
          },
          { loadMetadata: true },
        );

        cy.signInAsNormalUser();
      });

      it("allows accessing tools for non-admins", () => {
        cy.visit("/");
        cy.icon("gear").click();

        H.popover().findByText("Admin settings").click();

        cy.log("Tools smoke test");
        cy.location("pathname").should("eq", "/admin/tools/help");
        cy.findByRole("heading", {
          name: "Help",
        });

        cy.findByTestId("admin-layout-sidebar")
          .findByText("Erroring questions")
          .click();
        cy.location("pathname").should("eq", "/admin/tools/errors");
        cy.findByTestId("admin-layout-content").findByText(
          "Questions that errored when last run",
        );
      });
    });

    describe("revoked", () => {
      it("does not allow accessing admin tools for non-admins", () => {
        cy.signInAsNormalUser();
        cy.visit("/");
        cy.icon("gear").click();

        H.popover().findByText("Admin settings").should("not.exist");

        cy.visit("/admin/tools/errors");
        H.main().findByText("Sorry, you don’t have permission to see that.");

        cy.visit("/admin/tools/help");
        H.main().findByText("Sorry, you don’t have permission to see that.");
      });
    });
  });

  describe("settings permission", () => {
    describe("granted", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        H.modifyPermission("All Users", SETTINGS_INDEX, "Yes");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.signInAsNormalUser();
      });

      it("allows editing settings as a non-admin user", () => {
        cy.visit("/admin/settings");
        cy.url().should("include", "/admin/settings/general");

        cy.findByTestId("admin-layout-content").within(() => {
          cy.findByText("License and Billing").should("not.exist");
          cy.findByLabelText("Updates").should("not.exist");
          cy.findByLabelText("Site name")
            .should("be.visible")
            .clear()
            .type("NewName")
            .blur();
        });

        H.undoToast()
          .findByText(/changes saved/i)
          .should("be.visible");
      });
    });
  });

  describe("data studio permission", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
    });

    describe("granted", () => {
      beforeEach(() => {
        cy.visit("/admin/permissions/application");

        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");

        cy.button("Save changes").click();

        H.modal().within(() => {
          cy.findByText("Save permissions?");
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });
      });

      it("allows accessing data studio for non-admins but not transforms", () => {
        createLibraryWithItems();
        cy.signInAsNormalUser();

        cy.visit("/data-studio");
        cy.url().should("include", "/data-studio");
        H.main().should("be.visible");

        cy.log("transforms tab should not be visible for non-admins");
        cy.findByRole("link", { href: "/data-studio/transforms" }).should(
          "not.exist",
        );

        cy.log("transforms page should not be accessible for non-admins");
        cy.visit("/data-studio/transforms");
        H.main().findByText("Sorry, you don’t have permission to see that.");

        cy.log("transforms API should still be admin-only");
        cy.request({ url: "/api/ee/transform", failOnStatusCode: false })
          .its("status")
          .should("eq", 403);

        cy.log("Data Studio link should be visible for models in the library");
        cy.get("@trustedOrdersModelId").then((modelId) => {
          H.visitModel(modelId);
        });
        cy.findByLabelText("Open in Data Studio").click();
        cy.url().should(
          "match",
          new RegExp("/data-studio/modeling/models/\\d+$"),
        );
      });
    });

    describe("revoked", () => {
      it("does not allow accessing data studio for non-admins", () => {
        createLibraryWithItems();
        cy.signInAsNormalUser();

        cy.visit("/data-studio");
        H.main().findByText("Sorry, you don’t have permission to see that.");

        cy.log(
          "Data Studio link should not be visible for models in the library without permission",
        );
        cy.get("@trustedOrdersModelId").then((modelId) => {
          H.visitModel(modelId);
        });
        cy.findByLabelText("Open in Data Studio").should("not.exist");
      });
    });

    describe("library collection write access", () => {
      it("grants write access when non-admin creates the library", () => {
        cy.visit("/admin/permissions/application");
        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Create a question as admin first");
        H.createQuestion({
          name: "Question to become model",
          query: { "source-table": ORDERS_ID },
        }).then(({ body }) => {
          cy.wrap(body.id).as("questionId");
        });

        cy.signInAsNormalUser();

        cy.log("Non-admin creates the library - should get write access");
        H.createLibrary().then(({ data }) => {
          cy.wrap(data.id).as("dataCollectionId");
        });

        cy.log("Non-admin should be able to move question to library as model");
        cy.get("@questionId").then((questionId) => {
          cy.get("@dataCollectionId").then((collectionId) => {
            cy.request("PUT", `/api/card/${questionId}`, {
              type: "model",
              collection_id: collectionId,
            });
          });
        });

        cy.log("Verify permissions show Curate for All Users on library");
        cy.signInAsAdmin();
        cy.get("@dataCollectionId").then((collectionId) => {
          cy.visit(`/admin/permissions/collections/${collectionId}`);
        });
        H.assertPermissionForItem("All Users", 0, "Curate");
      });

      it("grants write access to existing library when data studio permission is granted", () => {
        cy.log("Admin creates library first");
        H.createLibrary().then(({ data }) => {
          cy.wrap(data.id).as("dataCollectionId");
        });

        cy.log("Create a question as admin");
        H.createQuestion({
          name: "Question to become model",
          query: { "source-table": ORDERS_ID },
        }).then(({ body }) => {
          cy.wrap(body.id).as("questionId");
        });

        cy.log("Grant data studio permission to All Users");
        cy.visit("/admin/permissions/application");
        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Verify permissions show Curate for All Users on library");
        cy.get("@dataCollectionId").then((collectionId) => {
          cy.visit(`/admin/permissions/collections/${collectionId}`);
        });
        H.assertPermissionForItem("All Users", 0, "Curate");

        cy.log("Non-admin should be able to move question to library as model");
        cy.signInAsNormalUser();
        cy.get("@questionId").then((questionId) => {
          cy.get("@dataCollectionId").then((collectionId) => {
            cy.request("PUT", `/api/card/${questionId}`, {
              type: "model",
              collection_id: collectionId,
            });
          });
        });

        cy.log("Verify model was created in the library");
        cy.get("@questionId").then((questionId) => {
          H.visitModel(questionId);
        });
        cy.findByLabelText("Open in Data Studio").should("be.visible");
      });
    });

    describe("library section visibility based on collection access", () => {
      it("shows permission error when opening model without data access", () => {
        const { ALL_USERS_GROUP } = USER_GROUPS;

        cy.log("Create library with a model");
        createLibraryWithItems();

        cy.log("Grant data studio permission to All Users");
        cy.visit("/admin/permissions/application");
        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Block data access for All Users group");
        cy.updatePermissionsGraph({
          [ALL_USERS_GROUP]: {
            [SAMPLE_DB_ID]: {
              "view-data": "blocked",
              "create-queries": "no",
            },
          },
        });

        cy.log(
          "Sign in as 'none' user (only in All Users group) and open model",
        );
        cy.signIn("none");

        cy.get("@trustedOrdersModelId").then((modelId) => {
          cy.visit(`/data-studio/modeling/models/${modelId}`);
        });

        cy.log("Verify permission error is shown");
        H.main()
          .findByText("Sorry, you don't have permission to run this query.")
          .should("be.visible");
      });

      it("hides library section when user has no access to library collections", () => {
        const { ALL_USERS_GROUP } = USER_GROUPS;

        cy.log("Create library as admin");
        H.createLibrary({ wrapIds: true });

        cy.log(
          "Grant data studio permission but revoke library collection access",
        );
        cy.visit("/admin/permissions/application");
        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Revoke collection access for All Users on library");
        cy.get("@libraryId").then((libraryId) => {
          cy.get("@dataCollectionId").then((dataId) => {
            cy.get("@metricsCollectionId").then((metricsId) => {
              cy.updateCollectionGraph({
                [ALL_USERS_GROUP]: {
                  [libraryId]: "none",
                  [dataId]: "none",
                  [metricsId]: "none",
                },
              });
            });
          });
        });

        cy.log("Sign in as 'none' user and verify library section is hidden");
        cy.signIn("none");
        cy.visit("/data-studio/modeling");

        H.DataStudio.ModelingSidebar.root().should("be.visible");
        H.DataStudio.ModelingSidebar.librarySection().should("not.exist");
        H.DataStudio.ModelingSidebar.glossarySection().should("be.visible");
      });

      it("shows only accessible library subcollections (partial access)", () => {
        const { ALL_USERS_GROUP } = USER_GROUPS;

        cy.log("Create library with items as admin");
        H.createLibrary({ wrapIds: true }).then(({ library, metrics }) => {
          H.createQuestion(
            {
              name: "Trusted Orders Model",
              query: { "source-table": ORDERS_ID },
            },
            { wrapId: true, idAlias: "trustedOrdersModelId" },
          ).then(() =>
            cy.get("@trustedOrdersModelId").then((modelId) => {
              cy.get("@dataCollectionId").then((dataCollectionId) => {
                cy.request("PUT", `/api/card/${modelId}`, {
                  type: "model",
                  collection_id: dataCollectionId,
                });
              });
            }),
          );

          cy.log("Grant data studio permission to All Users");
          cy.visit("/admin/permissions/application");
          H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
          cy.button("Save changes").click();
          H.modal().button("Yes").click();

          cy.log("Revoke access to Metrics collection only");
          cy.updateCollectionGraph({
            [ALL_USERS_GROUP]: {
              [library.id]: "read",
              [metrics.id]: "none",
            },
          });
        });

        cy.log("Sign in as 'none' user and verify partial library access");
        cy.signIn("none");
        cy.visit("/data-studio/modeling");

        H.DataStudio.ModelingSidebar.librarySection().should("be.visible");
        H.DataStudio.ModelingSidebar.collectionsTree().within(() => {
          cy.findByText("Data").should("be.visible");
          cy.findByText("Metrics").should("not.exist");
        });
      });
    });

    describe("data model section visibility", () => {
      it("hides Data tab for users without data model permission", () => {
        cy.log("Grant data studio permission to All Users");
        cy.visit("/admin/permissions/application");
        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Sign in as 'none' user and verify Data tab is not visible");
        cy.signIn("none");
        cy.visit("/data-studio/modeling");

        cy.log("Data tab should not be visible without data model permission");
        cy.findByTestId("data-studio-data-tab").should("not.exist");
        cy.findByTestId("data-studio-modeling-tab").should("be.visible");
      });

      it("shows Data tab for users with data model permission on any database", () => {
        const DATA_MODEL_PERMISSION_INDEX = 3;

        cy.log("Grant data studio permission to All Users");
        cy.visit("/admin/permissions/application");
        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Grant data model permission on Sample Database");
        cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
        H.modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Sign in as 'none' user and verify Data tab is visible");
        cy.signIn("none");
        cy.visit("/data-studio");

        cy.findByTestId("data-studio-data-tab").should("be.visible");
        cy.findByTestId("data-studio-modeling-tab").should("be.visible");
      });

      it("allows editing table metadata with blocked data access but data model permission", () => {
        const DATA_ACCESS_PERMISSION_INDEX = 0;
        const DATA_MODEL_PERMISSION_INDEX = 3;

        cy.log("Grant data studio permission to All Users");
        cy.visit("/admin/permissions/application");
        H.modifyPermission("All Users", DATA_STUDIO_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Block data access but grant data model permission");
        cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
        H.modifyPermission(
          "All Users",
          DATA_ACCESS_PERMISSION_INDEX,
          "Blocked",
        );
        H.modifyPermission("All Users", DATA_MODEL_PERMISSION_INDEX, "Yes");
        cy.button("Save changes").click();
        H.modal().button("Yes").click();

        cy.log("Sign in as 'none' user and verify can access data model");
        cy.signIn("none");

        cy.intercept("PUT", "/api/table/*").as("updateTable");
        cy.intercept(
          "GET",
          "/api/table/*/query_metadata?include_sensitive_fields=true&include_editable_data_model=true",
        ).as("tableMetadataFetch");

        cy.visit("/data-studio/data");
        cy.findByTestId("data-studio-data-tab").should("be.visible");

        cy.log("Select table and verify can edit metadata");
        H.DataModel.TablePicker.getTable("Orders").click();
        cy.wait("@tableMetadataFetch");

        cy.log("Update table name to verify edit permissions work");
        H.DataModel.TableSection.getNameInput()
          .should("have.value", "Orders")
          .clear()
          .type("Modified Orders")
          .blur();
        cy.wait("@updateTable");

        H.undoToast().should("contain.text", "Table name updated");
      });
    });
  });
});

function createSubscription(user_id) {
  H.createQuestionAndDashboard({
    questionDetails: {
      name: "Test Question",
      query: {
        "source-table": ORDERS_ID,
      },
    },
  }).then(({ body: { card_id, dashboard_id } }) => {
    H.createPulse({
      name: "Subscription",
      dashboard_id,
      cards: [
        {
          id: card_id,
          include_csv: false,
          include_xls: false,
        },
      ],
      channels: [
        {
          enabled: true,
          channel_type: "email",
          schedule_type: "hourly",
          recipients: [
            {
              id: user_id,
            },
          ],
        },
      ],
    });
  });
}
