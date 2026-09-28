import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  COLLECTION_GROUP_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type DataApp,
  DataPermission,
  DataPermissionValue,
  type FieldsPermissions,
  type SchemasPermissions,
  type Table,
} from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const APP_NAME = "legacy-permission-test";

// Exercise real queries: preserving the permission graph alone does not prove that data still loads.
describe("scenarios > data apps > legacy view data permissions", () => {
  describe("preserves 'no self-service' access level when a user is added to data app group", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      // TODO(GHY-4493) Direct saved questions currently reject legacy access after backend hardening
      // In the meantime, use a saved SQL source to test app membership separately from the regression.
      H.createNativeQuestion({
        name: "Orders SQL source",
        database: SAMPLE_DB_ID,
        native: { query: "SELECT COUNT(*) AS total FROM ORDERS" },
        collection_id: null,
      })
        .its("body.id")
        .as("sourceQuestionId");

      cy.get<number>("@sourceQuestionId")
        .then((sourceQuestionId) =>
          H.createQuestion({
            name: "Orders with legacy access",
            database: SAMPLE_DB_ID,
            query: { "source-table": `card__${sourceQuestionId}` },
            display: "scalar",
            collection_id: null,
          }),
        )
        .its("body.id")
        .as("questionId");

      setViewDataPermissions(DataPermissionValue.BLOCKED);

      cy.signIn("nodata");
      H.visitQuestion("@questionId");
      H.main()
        .findByText("Sorry, you don't have permission to run this query.")
        .should("be.visible");
      cy.findByTestId("scalar-value").should("not.exist");

      cy.signInAsAdmin();
    });

    it("with all tables using no self-service", () => {
      // every table is no self-service
      setViewDataPermissions(DataPermissionValue.LEGACY_NO_SELF_SERVICE);

      assertAccessSurvivesAppMembership();
    });

    it("with some tables being unrestricted", () => {
      // Clear the database block, including tables omitted from query metadata.
      setViewDataPermissions(DataPermissionValue.LEGACY_NO_SELF_SERVICE);

      cy.request<{ tables: Table[] }>(
        "GET",
        `/api/database/${SAMPLE_DB_ID}/metadata`,
      ).then(({ body: { tables } }) => {
        const permissions: Record<
          string,
          Record<number, FieldsPermissions>
        > = {};

        // orders table is no self-service, other tables are unrestricted
        for (const table of tables) {
          const schema = table.schema ?? "";
          permissions[schema] ??= {};

          permissions[schema][Number(table.id)] =
            table.id === ORDERS_ID
              ? DataPermissionValue.LEGACY_NO_SELF_SERVICE
              : DataPermissionValue.UNRESTRICTED;
        }

        setViewDataPermissions(permissions);
      });

      assertAccessSurvivesAppMembership();
    });
  });
});

function assertAccessSurvivesAppMembership() {
  cy.log("legacy access should let the no data user load the saved question");
  cy.signIn("nodata");
  H.visitQuestion("@questionId");

  cy.findByTestId("scalar-value", { timeout: 20_000 }).should(
    "have.text",
    "18,760",
  );

  cy.signInAsAdmin();
  cy.request<DataApp>("POST", `/api/apps/${APP_NAME}/draft`)
    .its("body")
    .as("app");

  cy.log("assign the no data user to the data app group");
  cy.get<DataApp>("@app").then(({ permission_group_id }) => {
    if (permission_group_id === null) {
      throw new Error("data app must have a permission group");
    }

    H.addUserToGroup(permission_group_id, USERS.nodata.email);
  });

  cy.log("the same saved question must still load after app membership");
  cy.signIn("nodata");
  H.visitQuestion("@questionId");

  cy.findByTestId("scalar-value", { timeout: 20_000 }).should(
    "have.text",
    "18,760",
  );
}

function setViewDataPermissions(viewData: SchemasPermissions) {
  // The no-data user belongs to both groups. Neither should override the legacy grant.
  cy.updatePermissionsGraph({
    [ALL_USERS_GROUP_ID]: {
      [SAMPLE_DB_ID]: {
        [DataPermission.VIEW_DATA]: viewData,
        [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
      },
    },

    [COLLECTION_GROUP_ID]: {
      [SAMPLE_DB_ID]: {
        [DataPermission.VIEW_DATA]: viewData,
        [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
      },
    },
  });
}
