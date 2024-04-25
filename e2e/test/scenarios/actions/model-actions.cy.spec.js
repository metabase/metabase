import { assocIn } from "icepick";

import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import {
  createImplicitActions,
  setActionsEnabledForDB,
  modal,
  popover,
  restore,
  fillActionQuery,
  createAction,
  resetTestTable,
  resyncDatabase,
  createModelFromTableName,
  queryWritableDB,
  setTokenFeatures,
  entityPickerModal,
} from "e2e/support/helpers";
import { getCreatePostgresRoleIfNotExistSql } from "e2e/support/test_roles";
import { createMockActionParameter } from "metabase-types/api/mocks";

const WRITABLE_TEST_TABLE = "scoreboard_actions";

const TEST_PARAMETER = createMockActionParameter({
  id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
  name: "Total",
  slug: "total",
  type: "number/=",
  target: ["variable", ["template-tag", "total"]],
});

const TEST_TEMPLATE_TAG = {
  id: TEST_PARAMETER.id,
  type: "number",
  name: TEST_PARAMETER.slug,
  "display-name": TEST_PARAMETER.name,
  slug: TEST_PARAMETER.slug,
};

const SAMPLE_QUERY_ACTION = {
  name: "Demo Action",
  type: "query",
  parameters: [TEST_PARAMETER],
  database_id: WRITABLE_DB_ID,
  dataset_query: {
    type: "native",
    native: {
      query: `UPDATE ORDERS SET TOTAL = TOTAL WHERE ID = {{ ${TEST_TEMPLATE_TAG.name} }}`,
      "template-tags": {
        [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
      },
    },
    database: WRITABLE_DB_ID,
  },
  visualization_settings: {
    fields: {
      [TEST_PARAMETER.id]: {
        id: TEST_PARAMETER.id,
        required: true,
        fieldType: "number",
        inputType: "number",
      },
    },
  },
};

const SAMPLE_WRITABLE_QUERY_ACTION = assocIn(
  SAMPLE_QUERY_ACTION,
  ["dataset_query", "native", "query"],
  `UPDATE ${WRITABLE_TEST_TABLE} SET score = 22 WHERE id = {{ ${TEST_TEMPLATE_TAG.name} }}`,
);

describe(
  "scenarios > models > actions",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();
      setActionsEnabledForDB(WRITABLE_DB_ID);

      createModelFromTableName({
        tableName: "orders",
        modelName: "Order",
        idAlias: "modelId",
      });

      cy.intercept("GET", "/api/card/*").as("getModel");
      cy.intercept("GET", "/api/action/*").as("getAction");
      cy.intercept("GET", "/api/action?model-id=*").as("getModelAction");
      cy.intercept("PUT", "/api/action/*").as("updateAction");
      cy.intercept("POST", "/api/action/*/execute").as("executeAction");
      cy.intercept("POST", "/api/action").as("createAction");
      cy.intercept("GET", "/api/table/*/query_metadata*").as("fetchMetadata");
      cy.intercept("GET", "/api/search?archived=true").as("getArchived");
      cy.intercept("GET", "/api/search?*").as("getSearchResults");
    });

    it("should allow CRUD operations on model actions", () => {
      cy.get("@modelId").then(id => {
        cy.visit(`/model/${id}/detail`);
        cy.wait("@getModel");
      });

      cy.findByRole("tablist").within(() => {
        cy.findByText("Actions").click();
      });

      createBasicActions();
      cy.findByLabelText("Action list").within(() => {
        cy.get("li").eq(0).findByText("Create").should("be.visible");
        cy.get("li").eq(1).findByText("Update").should("be.visible");
        cy.get("li").eq(2).findByText("Delete").should("be.visible");
      });

      cy.findByRole("link", { name: "New action" }).click();
      fillActionQuery("DELETE FROM orders WHERE id = {{ id }}");
      cy.findByRole("radiogroup", { name: "Field type" })
        .findByText("Number")
        .click();
      cy.findByRole("button", { name: "Save" }).click();
      modal()
        .eq(1)
        .within(() => {
          cy.findByLabelText("Name").type("Delete Order");
          cy.findByRole("button", { name: "Create" }).click();
        });
      cy.findByLabelText("Action list")
        .findByText("Delete Order")
        .should("be.visible");

      openActionEditorFor("Delete Order");
      fillActionQuery(" AND status = 'pending'");
      cy.findByRole("radiogroup", { name: "Field type" })
        .findByLabelText("Number")
        .should("be.checked");
      cy.findByRole("button", { name: "Update" }).click();

      cy.findByLabelText("Action list")
        .findByText(
          "DELETE FROM orders WHERE id = {{ id }} AND status = 'pending'",
        )
        .should("be.visible");

      openActionMenuFor("Delete Order");
      popover().findByText("Archive").click();

      modal().within(() => {
        cy.findByText("Archive Delete Order?").should("be.visible");
        cy.findByRole("button", { name: "Archive" }).click();
      });

      cy.findByRole("listitem", { name: "Delete Order" }).should("not.exist");

      cy.findByLabelText("Actions menu").click();
      popover().findByText("Disable basic actions").click();
      modal().within(() => {
        cy.findByText("Disable basic actions?").should("be.visible");
        cy.button("Disable").click();
      });

      cy.findAllByRole("tabpanel")
        .filter(":visible")
        .within(() => {
          cy.findByLabelText("Action list").should("not.exist");
          cy.findByText("Create").should("not.exist");
          cy.findByText("Update").should("not.exist");
          cy.findByText("Delete").should("not.exist");
        });

      cy.log("Go to the archive");
      cy.visit("/archive");

      getArchiveListItem("Delete Order")
        .icon("unarchive")
        .click({ force: true });

      cy.findByTestId("archived-list").within(() => {
        cy.findByText("Items you archive will appear here.");
        cy.findByText("Delete Order").should("not.exist");
      });

      cy.findByTestId("toast-undo").button("Undo").click();

      cy.findByTestId("archived-list").within(() => {
        cy.findByText("Items you archive will appear here.").should(
          "not.exist",
        );
        cy.findByText("Delete Order").should("be.visible");
      });

      cy.log("Delete the action");
      getArchiveListItem("Delete Order").icon("trash").click({ force: true });

      cy.findByTestId("archived-list").within(() => {
        cy.findByText("Items you archive will appear here.");
        cy.findByText("Delete Order").should("not.exist");
      });
    });

    it("should allow to create an action with the New button", () => {
      const QUERY = "UPDATE orders SET discount = {{ discount }}";
      cy.visit("/");

      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Action").click();

      fillActionQuery(QUERY);

      cy.findByRole("dialog").within(() => {
        cy.findByText(/New Action/)
          .clear()
          .type("Discount order");

        cy.findByRole("button", { name: "Save" }).click();
      });

      modal().eq(1).findByText("Select a model").click();
      entityPickerModal().within(() => {
        cy.findByText("Order").click();
      });

      cy.findByRole("button", { name: "Create" }).click();

      cy.get("@modelId").then(modelId => {
        cy.url().should("include", `/model/${modelId}/detail/actions`);
      });

      cy.findAllByRole("tabpanel")
        .filter(":visible")
        .within(() => {
          cy.findByText("Discount order").should("be.visible");
          cy.findByText(QUERY).should("be.visible");
        });
    });

    it("should respect permissions", () => {
      // Enabling actions for sample database as well
      // to test database picker behavior in the action editor
      setActionsEnabledForDB(SAMPLE_DB_ID);

      setTokenFeatures("all");
      cy.updatePermissionsGraph({
        [USER_GROUPS.ALL_USERS_GROUP]: {
          [WRITABLE_DB_ID]: {
            "view-data": "blocked",
            "create-queries": "no",
          },
        },
        [USER_GROUPS.DATA_GROUP]: {
          [WRITABLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": "query-builder-and-native",
          },
        },
      });

      cy.get("@modelId").then(modelId => {
        cy.request("POST", "/api/action", {
          ...SAMPLE_QUERY_ACTION,
          model_id: modelId,
        });
        cy.signIn("readonly");
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      openActionMenuFor(SAMPLE_QUERY_ACTION.name);
      popover().within(() => {
        cy.findByText("Archive").should("not.exist");
        cy.findByText("View").click();
      });

      cy.findByRole("dialog").within(() => {
        cy.findByDisplayValue(SAMPLE_QUERY_ACTION.name).should("be.disabled");

        cy.findByText("Sample Database").should("not.exist");
        cy.findByText("QA Postgres12").should("not.exist");

        cy.button("Save").should("not.exist");
        cy.button("Update").should("not.exist");

        assertQueryEditorDisabled();

        cy.findByRole("form").within(() => {
          cy.icon("gear").should("not.exist");
        });

        cy.findByLabelText("Action settings").click();
        cy.findByLabelText("Success message").should("be.disabled");
      });

      cy.signIn("normal");
      cy.reload();

      // Check can pick between all databases
      cy.findByRole("dialog").findByText("QA Postgres12").click();
      popover().within(() => {
        cy.findByText("Sample Database").should("be.visible");
        cy.findByText("QA Postgres12").should("be.visible");
      });

      cy.signInAsAdmin();
      setActionsEnabledForDB(SAMPLE_DB_ID, false);
      cy.signIn("normal");
      cy.reload();

      // Check can only see the action database
      cy.findByRole("dialog").within(() => {
        cy.findByText("QA Postgres12").click();

        cy.findByText("Sample Database").should("not.exist");
      });
    });

    it("should display parameters for variable template tags only", () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Action").click();

      fillActionQuery("{{#1-orders-model}}");
      cy.findByLabelText("#1-orders-model").should("not.exist");

      fillActionQuery("{{snippet:101}}");
      cy.findByLabelText("#1-orders-model").should("not.exist");
      cy.findByLabelText("101").should("not.exist");

      fillActionQuery("{{id}}");
      cy.findByLabelText("#1-orders-model").should("not.exist");
      cy.findByLabelText("101").should("not.exist");
      cy.findByLabelText("ID").should("be.visible");
    });

    it("should show detailed form errors for constraint violations when executing model actions", () => {
      const actionName = "Update";

      cy.get("@modelId").then(modelId => {
        createImplicitActions({ modelId });

        cy.visit(`/model/${modelId}/detail`);
        cy.wait("@getModel");
      });

      cy.findByRole("tablist").findByText("Actions").click();

      runActionFor(actionName);

      cy.wait("@getAction");

      modal().within(() => {
        cy.findByLabelText("ID").type("1");
        cy.findByLabelText("User ID").type("999999");
        cy.button(actionName).click();
        cy.wait("@executeAction");

        cy.findByLabelText("User ID").should("not.exist");
        cy.findByLabelText("User ID: This User_id does not exist.").should(
          "exist",
        );

        cy.findByText("Unable to update the record.").should("exist");
      });
    });
  },
);

["postgres", "mysql"].forEach(dialect => {
  describe(`Write actions on model detail page (${dialect})`, () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/card/*").as("getModel");
      cy.intercept("GET", "/api/action/*").as("getAction");

      cy.intercept("PUT", "/api/action/*").as("updateAction");
      cy.intercept("POST", "/api/action").as("createAction");
      cy.intercept("POST", "/api/action/*/public_link").as(
        "enableActionSharing",
      );
      cy.intercept("DELETE", "/api/action/*/public_link").as(
        "disableActionSharing",
      );

      resetTestTable({ type: dialect, table: WRITABLE_TEST_TABLE });
      restore(`${dialect}-writable`);
      cy.signInAsAdmin();
      resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: WRITABLE_TEST_TABLE });

      createModelFromTableName({
        tableName: WRITABLE_TEST_TABLE,
        idAlias: "writableModelId",
      });
    });

    it("should allow action execution from the model detail page", () => {
      queryWritableDB(
        `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 1`,
        dialect,
      ).then(result => {
        const row = result.rows[0];
        expect(row.score).to.equal(0);
      });

      cy.get("@writableModelId").then(modelId => {
        createAction({
          ...SAMPLE_WRITABLE_QUERY_ACTION,
          model_id: modelId,
        });
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      runActionFor(SAMPLE_QUERY_ACTION.name);

      modal().within(() => {
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.button(SAMPLE_QUERY_ACTION.name).click();
      });

      cy.findByTestId("toast-undo")
        .findByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`)
        .should("be.visible");

      queryWritableDB(
        `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 1`,
        dialect,
      ).then(result => {
        const row = result.rows[0];

        expect(row.score).to.equal(22);
      });
    });

    it("should allow public sharing of actions and execution of public actions", () => {
      const IMPLICIT_ACTION_NAME = "Update";

      cy.get("@writableModelId").then(modelId => {
        createAction({
          ...SAMPLE_WRITABLE_QUERY_ACTION,
          model_id: modelId,
        });
        createAction({
          type: "implicit",
          kind: "row/update",
          name: IMPLICIT_ACTION_NAME,
          model_id: modelId,
        });
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      enableSharingFor(SAMPLE_WRITABLE_QUERY_ACTION.name, {
        publicUrlAlias: "queryActionPublicUrl",
      });
      enableSharingFor(IMPLICIT_ACTION_NAME, {
        publicUrlAlias: "implicitActionPublicUrl",
      });

      cy.signOut();

      cy.get("@queryActionPublicUrl").then(url => {
        cy.visit(url);
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.button(SAMPLE_QUERY_ACTION.name).click();
        cy.findByText(
          `${SAMPLE_WRITABLE_QUERY_ACTION.name} ran successfully`,
        ).should("be.visible");
        cy.findByRole("form").should("not.exist");
        cy.button(SAMPLE_QUERY_ACTION.name).should("not.exist");

        queryWritableDB(
          `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 1`,
          dialect,
        ).then(result => {
          const row = result.rows[0];

          expect(row.score).to.equal(22);
        });
      });

      cy.get("@implicitActionPublicUrl").then(url => {
        cy.visit(url);

        // team 2 has 10 points, let's give them more
        cy.findByLabelText("ID").type("2");
        cy.findByLabelText(/score/i).type("16");
        cy.findByLabelText(/team name/i).type("Bouncy Bears");

        cy.button(IMPLICIT_ACTION_NAME).click();
        cy.findByText(`${IMPLICIT_ACTION_NAME} ran successfully`).should(
          "be.visible",
        );
        cy.findByRole("form").should("not.exist");
        cy.button(IMPLICIT_ACTION_NAME).should("not.exist");

        queryWritableDB(
          `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 2`,
          dialect,
        ).then(result => {
          const row = result.rows[0];

          expect(row.score).to.equal(16);
          expect(row.team_name).to.equal("Bouncy Bears");
          // should not mutate form fields that we don't touch
          expect(row.status).to.not.be.a("null");
        });
      });

      cy.signInAsAdmin();
      cy.get("@writableModelId").then(modelId => {
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      disableSharingFor(SAMPLE_QUERY_ACTION.name);
      disableSharingFor(IMPLICIT_ACTION_NAME);

      cy.signOut();

      cy.get("@queryActionPublicUrl").then(url => {
        cy.visit(url);
        cy.findByRole("form").should("not.exist");
        cy.button(SAMPLE_QUERY_ACTION.name).should("not.exist");
        cy.findByText("Not found").should("be.visible");
      });

      cy.get("@implicitActionPublicUrl").then(url => {
        cy.visit(url);
        cy.findByRole("form").should("not.exist");
        cy.button(SAMPLE_QUERY_ACTION.name).should("not.exist");
        cy.findByText("Not found").should("be.visible");
      });
    });

    it("should allow query action execution from the model details page", () => {
      verifyScoreValue(0, dialect);

      cy.get("@writableModelId").then(modelId => {
        createAction({
          ...SAMPLE_WRITABLE_QUERY_ACTION,
          model_id: modelId,
        });
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      openActionEditorFor(SAMPLE_QUERY_ACTION.name);

      fillActionQuery(" [[and status = {{ current_status}}]]");
      cy.findAllByTestId("form-field-container")
        .filter(":contains('Current Status')")
        .within(() => {
          cy.findByLabelText("Show field").click();
          cy.icon("gear").click();
        });

      popover().within(() => {
        cy.findByLabelText("Required").uncheck();
      });

      cy.findByRole("button", { name: "Update" }).click();

      runActionFor(SAMPLE_QUERY_ACTION.name);

      modal().within(() => {
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.findByLabelText("Current Status").should("not.exist");

        cy.button(SAMPLE_QUERY_ACTION.name).click();
      });

      cy.findByTestId("toast-undo")
        .findByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`)
        .should("be.visible");

      verifyScoreValue(22, dialect);

      openActionEditorFor(SAMPLE_QUERY_ACTION.name);

      cy.findAllByTestId("form-field-container")
        .filter(":contains('Current Status')")
        .within(() => {
          cy.icon("gear").click();
        });

      popover().within(() => {
        cy.findByLabelText("Required").check();
      });
      cy.findByRole("button", { name: "Update" }).click();

      runActionFor(SAMPLE_QUERY_ACTION.name);

      modal().within(() => {
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.findByLabelText("Current Status").should("not.exist");

        cy.button(SAMPLE_QUERY_ACTION.name).should("be.disabled");

        cy.findByRole("button", { name: "Cancel" }).click();
      });

      openActionEditorFor(SAMPLE_QUERY_ACTION.name);

      // reset score value to 0
      resetAndVerifyScoreValue(dialect);

      cy.findByRole("dialog").within(() => {
        cy.findAllByTestId("form-field-container")
          .filter(":contains('Current Status')")
          .within(() => {
            cy.findByLabelText("Show field").click();
            cy.findByLabelText("Show field").should("be.checked");
          });
        cy.findByRole("button", { name: "Update" }).click();
      });

      runActionFor(SAMPLE_QUERY_ACTION.name);

      modal().within(() => {
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.button(SAMPLE_QUERY_ACTION.name).should("be.disabled");

        cy.findByLabelText("Current Status").type("active");

        cy.button(SAMPLE_QUERY_ACTION.name).click();
      });

      verifyScoreValue(22, dialect);
    });

    it("should allow implicit action execution from the model details page", () => {
      cy.get("@writableModelId").then(id => {
        cy.visit(`/model/${id}/detail`);
        cy.wait("@getModel");
      });

      cy.findByRole("tablist").within(() => {
        cy.findByText("Actions").click();
      });

      createBasicActions();

      openActionEditorFor("Create");

      cy.wait("@getAction").then(({ response }) => {
        const { parameters, visualization_settings } = response.body;
        expect(parameters).to.have.length(5);
        expect(visualization_settings).to.have.property("fields");
      });

      cy.findAllByTestId("form-field-container")
        .filter(":contains('Created At')")
        .within(() => {
          cy.findByLabelText("Show field").click();
          cy.findByLabelText("Show field").should("not.be.checked");
        });

      cy.findByRole("button", { name: "Update" }).click();

      runActionFor("Create");

      modal().within(() => {
        cy.findByLabelText("Created At").should("not.exist");
        cy.findByLabelText("Team Name").type("Zebras");
        cy.findByLabelText("Score").type("1");

        cy.findByRole("button", { name: "Save" }).click();
      });

      cy.findByTestId("toast-undo")
        .findByText("Successfully saved")
        .should("be.visible");

      // show toast
      queryWritableDB(
        `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE team_name = 'Zebras'`,
        dialect,
      ).then(result => {
        expect(result.rows.length).to.equal(1);

        const row = result.rows[0];

        expect(row.score).to.equal(1);
      });
    });

    it("should allow public sharing of query action and execution", () => {
      cy.get("@writableModelId").then(modelId => {
        createAction({
          ...SAMPLE_WRITABLE_QUERY_ACTION,
          model_id: modelId,
        });

        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      enableSharingFor(SAMPLE_WRITABLE_QUERY_ACTION.name, {
        publicUrlAlias: "queryActionPublicUrl",
      });

      openActionEditorFor(SAMPLE_WRITABLE_QUERY_ACTION.name);

      fillActionQuery(" [[ AND status = {{new_status}} ]]");

      cy.findAllByTestId("form-field-container")
        .filter(":contains('New Status')")
        .within(() => {
          cy.findByLabelText("Show field").click();
          cy.findByLabelText("Show field").should("not.be.checked");

          cy.icon("gear").click();
        });

      popover().within(() => {
        cy.findByLabelText("Required").uncheck();
      });

      cy.findByRole("button", { name: "Update" }).click();

      cy.signOut();

      cy.get("@queryActionPublicUrl").then(url => {
        cy.visit(url);
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.findByLabelText("New Status").should("not.exist");

        cy.button(SAMPLE_QUERY_ACTION.name).click();

        cy.findByText(
          `${SAMPLE_WRITABLE_QUERY_ACTION.name} ran successfully`,
        ).should("be.visible");

        queryWritableDB(
          `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 1`,
          dialect,
        ).then(result => {
          const row = result.rows[0];

          expect(row.score).to.equal(22);
        });
      });
    });

    it("should allow public sharing of implicit action and execution", () => {
      cy.get("@writableModelId").then(id => {
        cy.visit(`/model/${id}/detail`);
        cy.wait("@getModel");
      });

      cy.findByRole("tablist").within(() => {
        cy.findByText("Actions").click();
      });

      createBasicActions();

      enableSharingFor("Update", { publicUrlAlias: "updatePublicURL" });

      openActionEditorFor("Update");

      cy.findAllByTestId("form-field-container")
        .filter(":contains('Created At')")
        .within(() => {
          cy.findByLabelText("Show field").click();
          cy.findByLabelText("Show field").should("not.be.checked");
        });

      cy.findByRole("button", { name: "Update" }).click();

      cy.wait("@updateAction");

      cy.signOut();

      cy.get("@updatePublicURL").then(url => {
        cy.visit(url);

        // team 2 has 10 points, let's give them more
        cy.findByLabelText("ID").type("2");
        cy.findByLabelText("Score").type("16");
        cy.findByLabelText("Team Name").type("Bouncy Bears");
        cy.findByLabelText("Create At").should("not.exist");

        cy.button("Update").click();

        cy.findByText("Update ran successfully").should("be.visible");

        queryWritableDB(
          `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 2`,
          dialect,
        ).then(result => {
          const row = result.rows[0];

          expect(row.score).to.equal(16);
          expect(row.team_name).to.equal("Bouncy Bears");
        });
      });
    });

    it("should respect impersonated permission", () => {
      cy.onlyOn(dialect === "postgres");
      const role = "readonly_role";
      const sql = getCreatePostgresRoleIfNotExistSql(
        role,
        `GRANT SELECT ON ${WRITABLE_TEST_TABLE} TO ${role};`,
      );
      setTokenFeatures("all");
      queryWritableDB(sql);

      const impersonatedUserId = 9;
      cy.request("PUT", `/api/user/${impersonatedUserId}`, {
        login_attributes: { role },
      });

      cy.updatePermissionsGraph(
        {
          [USER_GROUPS.ALL_USERS_GROUP]: {
            [WRITABLE_DB_ID]: {
              "view-data": "impersonated",
              "create-queries": "query-builder-and-native",
            },
          },
          // By default, all groups get `unrestricted` access that will override the impersonation.
          [USER_GROUPS.COLLECTION_GROUP]: {
            [WRITABLE_DB_ID]: {
              "view-data": "blocked",
            },
          },
        },
        [
          {
            db_id: WRITABLE_DB_ID,
            group_id: USER_GROUPS.ALL_USERS_GROUP,
            attribute: "role",
          },
        ],
      );

      queryWritableDB(
        `SELECT *
         FROM ${WRITABLE_TEST_TABLE}
         WHERE id = 1`,
        dialect,
      ).then(result => {
        const row = result.rows[0];
        expect(row.score).to.equal(0);
      });

      cy.get("@writableModelId").then(modelId => {
        createAction({
          ...SAMPLE_WRITABLE_QUERY_ACTION,
          model_id: modelId,
        });
        cy.signInAsImpersonatedUser();
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      runActionFor(SAMPLE_QUERY_ACTION.name);

      modal().within(() => {
        cy.findByLabelText(TEST_PARAMETER.name).type("1");
        cy.button(SAMPLE_QUERY_ACTION.name).click();

        cy.findByText(
          "Error executing Action: Error executing write query: ERROR: permission denied for table scoreboard_actions",
        );
      });

      queryWritableDB(
        `SELECT *
         FROM ${WRITABLE_TEST_TABLE}
         WHERE id = 1`,
        dialect,
      ).then(result => {
        const row = result.rows[0];
        expect(row.score).to.equal(0);
      });
    });
  });
});

function runActionFor(actionName) {
  cy.findByRole("listitem", { name: actionName }).within(() => {
    cy.icon("play").click();
  });
}

function openActionMenuFor(actionName) {
  cy.findByRole("listitem", { name: actionName }).within(() => {
    cy.icon("ellipsis").click();
  });
}

function openActionEditorFor(actionName, { isReadOnly = false } = {}) {
  openActionMenuFor(actionName);
  popover()
    .findByText(isReadOnly ? "View" : "Edit")
    .click();
}

function assertQueryEditorDisabled() {
  // Ace doesn't act as a normal input, so we can't use `should("be.disabled")`
  // Instead we'd assert that a user can't type in the editor
  fillActionQuery("QWERTY");
  cy.findByText("QWERTY").should("not.exist");
}

function enableSharingFor(actionName, { publicUrlAlias }) {
  openActionEditorFor(actionName);

  cy.findByRole("dialog").within(() => {
    cy.button("Action settings").click();
    cy.findByLabelText("Make public").should("not.be.checked").click();
    cy.wait("@enableActionSharing");
    cy.findByLabelText("Public action form URL")
      .invoke("val")
      .then(url => {
        cy.wrap(url).as(publicUrlAlias);
      });
    cy.button("Cancel").click();
  });
}

function disableSharingFor(actionName) {
  openActionEditorFor(actionName);
  cy.findByRole("dialog").within(() => {
    cy.findByRole("button", { name: "Action settings" }).click();
    cy.findByLabelText("Make public").should("be.checked").click();
  });
  modal()
    .eq(1)
    .within(() => {
      cy.findByText("Disable this public link?").should("be.visible");
      cy.findByRole("button", { name: "Yes" }).click();
    });
  cy.wait("@disableActionSharing");
  cy.findByRole("dialog").within(() => {
    cy.button("Cancel").click();
  });
}

function getArchiveListItem(itemName) {
  return cy.findByTestId(`archive-item-${itemName}`);
}

function resetAndVerifyScoreValue(dialect) {
  const newValue = 0;

  queryWritableDB(
    `UPDATE ${WRITABLE_TEST_TABLE} SET score = ${newValue} WHERE id = 1`,
    dialect,
  );

  verifyScoreValue(newValue, dialect);
}

function verifyScoreValue(value, dialect) {
  queryWritableDB(
    `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 1`,
    dialect,
  ).then(result => {
    const row = result.rows[0];

    expect(row.score).to.equal(value);
  });
}

function createBasicActions() {
  cy.findByRole("button", { name: /Create basic actions/i }).click();

  cy.wait(["@createAction", "@createAction", "@createAction"]);
}
