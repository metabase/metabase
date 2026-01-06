const { H } = cy;
import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { DataPermissionValue } from "metabase/admin/permissions/types";

const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

const TRANSFORMS_PERMISSION_INDEX = 5;

const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "permission_test_table";
const TARGET_SCHEMA = "Schema A";

describe(
  "scenarios > admin > permissions > transforms permissions",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_schemas" });
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

      cy.intercept("POST", "/api/ee/transform").as("createTransform");
      cy.intercept("POST", "/api/ee/transform/*/run").as("runTransform");
    });

    describe("permission editor UI", () => {
      it("shows Transforms column only at database level, not schema level", () => {
        cy.visit(`/admin/permissions/data/database/${WRITABLE_DB_ID}`);
        cy.findByTestId("permission-table")
          .find("thead")
          .should("contain.text", "Transforms");

        cy.visit(
          `/admin/permissions/data/database/${WRITABLE_DB_ID}/schema/Schema%20A`,
        );
        cy.findByTestId("permission-table")
          .find("thead")
          .should("not.contain.text", "Transforms");
      });

      it("allows changing and saving transforms permission", () => {
        cy.intercept("PUT", "/api/permissions/graph").as("savePermissions");

        cy.visit(`/admin/permissions/data/database/${WRITABLE_DB_ID}`);

        H.assertPermissionForItem(
          "All Users",
          TRANSFORMS_PERMISSION_INDEX,
          "No",
        );

        H.modifyPermission("All Users", TRANSFORMS_PERMISSION_INDEX, "Yes");

        cy.button("Save changes").click();
        H.modal().within(() => {
          cy.button("Yes").click();
        });

        cy.wait("@savePermissions").then((interception) => {
          expect(
            interception.request.body.groups[ALL_USERS_GROUP][WRITABLE_DB_ID]
              .transforms,
          ).to.equal("yes");
        });

        H.assertPermissionForItem(
          "All Users",
          TRANSFORMS_PERMISSION_INDEX,
          "Yes",
        );
      });
    });

    describe("transforms access with permission granted", () => {
      beforeEach(() => {
        grantTransformsPermissionToAllGroups();
      });

      it("allows user to view transforms list page", () => {
        cy.signInAsNormalUser();
        cy.visit("/data-studio/transforms");

        cy.findByTestId("transforms-sidebar").should("be.visible");
        cy.findByTestId("transforms-sidebar")
          .button("Create a transform")
          .should("be.visible");
      });

      it("allows user to create a new transform via UI", () => {
        cy.signInAsNormalUser();
        cy.visit("/data-studio/transforms");

        cy.findByTestId("transforms-sidebar")
          .button("Create a transform")
          .click();
        H.popover().findByText("Query builder").click();

        H.miniPicker().within(() => {
          cy.findByText("Writable Postgres12").click();
          cy.findByText(TARGET_SCHEMA).click();
          cy.findByText(SOURCE_TABLE).click();
        });

        cy.findByTestId("transform-query-editor").button("Save").click();
        H.modal().within(() => {
          cy.findByLabelText("Name").clear().type("User Created Transform");
          cy.findByLabelText("Table name").type(TARGET_TABLE);
          cy.button("Save").click();
        });

        cy.wait("@createTransform")
          .its("response.statusCode")
          .should("eq", 200);
      });

      it("allows user to run a transform and view results", () => {
        cy.signInAsNormalUser();

        H.createAndRunMbqlTransform({
          sourceTable: SOURCE_TABLE,
          targetTable: TARGET_TABLE,
          targetSchema: TARGET_SCHEMA,
          name: "Permission Test Transform",
        }).then(({ transformId }) => {
          H.visitTransform(transformId);

          cy.findByTestId("transform-query-editor").should("be.visible");
          H.DataStudio.Transforms.runTab().click();
          cy.findByText("succeeded", { timeout: 10000 }).should("be.visible");
        });
      });

      it("allows user to view an existing transform created by admin", () => {
        cy.signInAsAdmin();
        H.createAndRunMbqlTransform({
          sourceTable: SOURCE_TABLE,
          targetTable: TARGET_TABLE,
          targetSchema: TARGET_SCHEMA,
          name: "Admin Created Transform",
        }).then(({ transformId }) => {
          cy.signInAsNormalUser();
          H.visitTransform(transformId);

          cy.findByTestId("transform-query-editor").should("be.visible");
          H.DataStudio.Transforms.header()
            .findByText("Admin Created Transform")
            .should("be.visible");
        });
      });
    });

    describe("transforms access denied without permission", () => {
      beforeEach(() => {
        denyTransformsPermissionToAllGroups();
      });

      it("denies user access to transforms list page", () => {
        cy.signInAsNormalUser();
        cy.visit("/data-studio/transforms");

        cy.url().should("include", "/unauthorized");
        cy.findByRole("img", { name: /key/ }).should("exist");
      });

      it("denies user access to a specific transform page", () => {
        cy.signInAsAdmin();
        H.createAndRunMbqlTransform({
          sourceTable: SOURCE_TABLE,
          targetTable: TARGET_TABLE,
          targetSchema: TARGET_SCHEMA,
          name: "Admin Only Transform",
        }).then(({ transformId }) => {
          cy.signInAsNormalUser();
          H.visitTransform(transformId);

          cy.url().should("include", "/unauthorized");
          cy.findByRole("img", { name: /key/ }).should("exist");
        });
      });

      it("denies user from creating transforms via API", () => {
        cy.signInAsNormalUser();

        H.getTableId({ databaseId: WRITABLE_DB_ID, name: SOURCE_TABLE }).then(
          (tableId) => {
            cy.request({
              method: "POST",
              url: "/api/ee/transform",
              failOnStatusCode: false,
              body: {
                name: "Unauthorized Transform",
                source: {
                  type: "query",
                  query: {
                    database: WRITABLE_DB_ID,
                    type: "query",
                    query: { "source-table": tableId, limit: 5 },
                  },
                },
                target: {
                  type: "table",
                  database: WRITABLE_DB_ID,
                  name: "unauthorized_table",
                  schema: TARGET_SCHEMA,
                },
              },
            }).then((response) => {
              expect(response.status).to.eq(403);
            });
          },
        );
      });

      it("denies user from running transforms via API", () => {
        cy.signInAsAdmin();
        H.createMbqlTransform({
          sourceTable: SOURCE_TABLE,
          targetTable: TARGET_TABLE,
          targetSchema: TARGET_SCHEMA,
          name: "Transform to Run",
        }).then(({ body: transform }) => {
          cy.signInAsNormalUser();

          cy.request({
            method: "POST",
            url: `/api/ee/transform/${transform.id}/run`,
            failOnStatusCode: false,
          }).then((response) => {
            expect(response.status).to.eq(403);
          });
        });
      });
    });

    describe("permission changes affect access immediately", () => {
      it("grants access after permission is added", () => {
        denyTransformsPermissionToAllGroups();

        cy.signInAsNormalUser();
        cy.visit("/data-studio/transforms");
        cy.url().should("include", "/unauthorized");

        cy.signInAsAdmin();
        grantTransformsPermissionToAllGroups();

        cy.signInAsNormalUser();
        cy.visit("/data-studio/transforms");
        cy.findByTestId("transforms-sidebar").should("be.visible");
      });

      it("revokes access after permission is removed", () => {
        grantTransformsPermissionToAllGroups();

        cy.signInAsNormalUser();
        cy.visit("/data-studio/transforms");
        cy.findByTestId("transforms-sidebar").should("be.visible");

        cy.signInAsAdmin();
        denyTransformsPermissionToAllGroups();

        cy.signInAsNormalUser();
        cy.visit("/data-studio/transforms");
        cy.url().should("include", "/unauthorized");
      });
    });
  },
);

function grantTransformsPermissionToAllGroups() {
  cy.updatePermissionsGraph({
    [ALL_USERS_GROUP]: {
      [WRITABLE_DB_ID]: {
        "view-data": DataPermissionValue.UNRESTRICTED,
        "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        transforms: DataPermissionValue.YES,
      },
    },
    [COLLECTION_GROUP]: {
      [WRITABLE_DB_ID]: {
        "view-data": DataPermissionValue.UNRESTRICTED,
        "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        transforms: DataPermissionValue.YES,
      },
    },
    [DATA_GROUP]: {
      [WRITABLE_DB_ID]: {
        "view-data": DataPermissionValue.UNRESTRICTED,
        "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        transforms: DataPermissionValue.YES,
      },
    },
  });
}

function denyTransformsPermissionToAllGroups() {
  cy.updatePermissionsGraph({
    [ALL_USERS_GROUP]: {
      [WRITABLE_DB_ID]: {
        "view-data": DataPermissionValue.UNRESTRICTED,
        "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        transforms: DataPermissionValue.NO,
      },
    },
    [COLLECTION_GROUP]: {
      [WRITABLE_DB_ID]: {
        "view-data": DataPermissionValue.UNRESTRICTED,
        "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        transforms: DataPermissionValue.NO,
      },
    },
    [DATA_GROUP]: {
      [WRITABLE_DB_ID]: {
        "view-data": DataPermissionValue.UNRESTRICTED,
        "create-queries": DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
        transforms: DataPermissionValue.NO,
      },
    },
  });
}
