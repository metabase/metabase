const { H } = cy;
import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { IMPERSONATED_USER_ID } from "e2e/support/cypress_sample_instance_data";
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

const SAMPLE_WRITABLE_QUERY_ACTION = {
  ...SAMPLE_QUERY_ACTION,
  dataset_query: {
    ...SAMPLE_QUERY_ACTION.dataset_query,
    native: {
      ...SAMPLE_QUERY_ACTION.dataset_query.native,
      query: `UPDATE ${WRITABLE_TEST_TABLE} SET score = 22 WHERE id = {{ ${TEST_TEMPLATE_TAG.name} }}`,
    },
  },
};

describe(
  "scenarios > actions > model actions",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();
      H.setActionsEnabledForDB(WRITABLE_DB_ID);

      H.createModelFromTableName({
        tableName: "orders",
        modelName: "Order",
        idAlias: "modelId",
      });

      cy.intercept("GET", "/api/card/*").as("getModel");
    });

    it("should respect permissions", () => {
      // Enabling actions for sample database as well
      // to test database picker behavior in the action editor
      H.setActionsEnabledForDB(SAMPLE_DB_ID);

      H.activateToken("pro-self-hosted");
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

      cy.get("@modelId").then((modelId) => {
        cy.request("POST", "/api/action", {
          ...SAMPLE_QUERY_ACTION,
          model_id: modelId,
        });
        cy.signIn("readonly");
        cy.visit(`/model/${modelId}/detail/actions`);
        cy.wait("@getModel");
      });

      openActionMenuFor(SAMPLE_QUERY_ACTION.name);
      H.popover().within(() => {
        cy.findByText("View").should("be.visible");
        cy.findByText("Delete").should("not.exist");
        cy.findByText("View").click();
      });

      cy.findByRole("dialog").within(() => {
        cy.findByDisplayValue(SAMPLE_QUERY_ACTION.name).should("be.disabled");

        cy.findByText("Sample Database").should("not.exist");
        cy.findByText("QA Postgres12").should("not.exist");

        cy.button("Cancel").should("be.visible");
        cy.button("Save").should("not.exist");
        cy.button("Update").should("not.exist");

        assertQueryEditorDisabled();

        cy.findByRole("form").within(() => {
          cy.findByLabelText("Total").should("be.visible");
          cy.icon("gear").should("not.exist");
        });

        cy.findByLabelText("Action settings").click();
        cy.findByLabelText("Success message").should("be.disabled");
      });

      cy.signInAsAdmin();
      cy.reload();

      // Check can pick between all databases
      cy.findByRole("dialog")
        .findByTestId("gui-builder-data")
        .findByText("QA Postgres12")
        .click();
      H.popover().within(() => {
        cy.findByText("Sample Database").should("be.visible");
        cy.findByText("QA Postgres12").should("be.visible");
      });

      H.setActionsEnabledForDB(SAMPLE_DB_ID, false);
      cy.reload();

      // Check can only see the action database
      cy.findByRole("dialog").within(() => {
        cy.findByTestId("selected-database").should(
          "have.text",
          "QA Postgres12",
        );
        cy.findByTestId("gui-builder-data").should("not.exist");
      });
    });
  },
);

["postgres", "mysql"].forEach((dialect) => {
  describe(
    `Write actions on model detail page (${dialect})`,
    { tags: "@external" },
    () => {
      before(() => {
        H.restore(`${dialect}-writable`);
        H.resetTestTable({ type: dialect, table: WRITABLE_TEST_TABLE });
        cy.signInAsAdmin();
        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
          tableName: WRITABLE_TEST_TABLE,
        });
        H.snapshot(`model-actions-${dialect}`);
      });

      beforeEach(() => {
        cy.intercept("GET", "/api/card/*").as("getModel");
        cy.intercept("GET", "/api/action/*").as("getAction");

        H.restore(`model-actions-${dialect}`);
        H.resetTestTable({ type: dialect, table: WRITABLE_TEST_TABLE });
        cy.signInAsAdmin();

        H.createModelFromTableName({
          tableName: WRITABLE_TEST_TABLE,
          idAlias: "writableModelId",
        });
      });

      it("should allow anonymous execution of public actions", () => {
        const IMPLICIT_ACTION_NAME = "Update";

        cy.get("@writableModelId").then((modelId) => {
          H.createAction({
            ...SAMPLE_WRITABLE_QUERY_ACTION,
            model_id: modelId,
          }).then(({ id }) => {
            cy.wrap(id).as("queryActionId");
            enablePublicSharing(id, { publicUrlAlias: "queryActionPublicUrl" });
          });
          H.createImplicitAction({ model_id: modelId, kind: "update" }).then(
            ({ id }) => {
              cy.wrap(id).as("implicitActionId");
              enablePublicSharing(id, {
                publicUrlAlias: "implicitActionPublicUrl",
              });
            },
          );
        });

        cy.signOut();

        cy.get("@queryActionPublicUrl").then((url) => {
          cy.visit(url);
          cy.findByLabelText(TEST_PARAMETER.name).type("1");

          cy.button(SAMPLE_QUERY_ACTION.name).click();
          cy.findByText(
            `${SAMPLE_WRITABLE_QUERY_ACTION.name} ran successfully`,
          ).should("be.visible");

          verifyScoreValue(22, dialect);
        });

        cy.get("@implicitActionPublicUrl").then((url) => {
          cy.visit(url);

          // team 2 has 10 points, let's give them more
          cy.findByLabelText("ID").type("2");
          cy.findByLabelText("Score").type("16");
          cy.findByLabelText("Team Name").type("Bouncy Bears");

          cy.button(IMPLICIT_ACTION_NAME).click();
          cy.findByText(`${IMPLICIT_ACTION_NAME} ran successfully`).should(
            "be.visible",
          );

          H.queryWritableDB(
            `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 2`,
            dialect,
          ).then((result) => {
            const row = result.rows[0];

            expect(row.score).to.equal(16);
            expect(row.team_name).to.equal("Bouncy Bears");
            // should not mutate form fields that we don't touch
            expect(row.status).to.not.be.a("null");
          });
        });

        cy.signInAsAdmin();
        cy.get("@queryActionId").then(disablePublicSharing);
        cy.get("@implicitActionId").then(disablePublicSharing);
        cy.signOut();

        cy.get("@queryActionPublicUrl").then((url) => {
          cy.visit(url);
          cy.findByText("Not found").should("be.visible");
          cy.findByRole("form").should("not.exist");
          cy.button(SAMPLE_QUERY_ACTION.name).should("not.exist");
        });

        cy.get("@implicitActionPublicUrl").then((url) => {
          cy.visit(url);
          cy.findByText("Not found").should("be.visible");
          cy.findByRole("form").should("not.exist");
          cy.button(IMPLICIT_ACTION_NAME).should("not.exist");
        });
      });

      it("should run implicit and query actions from the model detail page", () => {
        cy.get("@writableModelId").then((modelId) => {
          H.createImplicitAction({ model_id: modelId, kind: "create" });
          H.createAction({
            ...SAMPLE_WRITABLE_QUERY_ACTION,
            model_id: modelId,
          });
          cy.visit(`/model/${modelId}/detail/actions`);
          cy.wait("@getModel");
        });

        cy.log("Implicit action");
        runActionFor("Create");

        H.modal().within(() => {
          cy.findByLabelText("Team Name").type("Zebras");
          cy.findByLabelText("Score").type("1");

          cy.findByRole("button", { name: "Save" }).click();
        });

        H.undoToast().findByText("Successfully saved").should("be.visible");
        H.undoToast().icon("close").click();
        H.undoToast().should("not.exist");

        H.queryWritableDB(
          `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE team_name = 'Zebras'`,
          dialect,
        ).then((result) => {
          expect(result.rows.length).to.equal(1);

          const row = result.rows[0];

          expect(row.score).to.equal(1);
        });

        cy.log("Query action");
        verifyScoreValue(0, dialect);

        runActionFor(SAMPLE_QUERY_ACTION.name);

        H.modal().within(() => {
          cy.findByLabelText(TEST_PARAMETER.name).type("1");
          cy.button(SAMPLE_QUERY_ACTION.name).click();
        });

        H.undoToast()
          .findByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`)
          .should("be.visible");

        verifyScoreValue(22, dialect);
      });

      if (dialect === "postgres") {
        it("should respect impersonated permission", () => {
          const role = "readonly_role";
          const sql = getCreatePostgresRoleIfNotExistSql(
            role,
            `GRANT SELECT ON ${WRITABLE_TEST_TABLE} TO ${role};`,
          );
          H.activateToken("pro-self-hosted");
          H.queryWritableDB(sql);

          cy.request("PUT", `/api/user/${IMPERSONATED_USER_ID}`, {
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

          H.queryWritableDB(
            `SELECT *
           FROM ${WRITABLE_TEST_TABLE}
           WHERE id = 1`,
            dialect,
          ).then((result) => {
            const row = result.rows[0];
            expect(row.score).to.equal(0);
          });

          cy.get("@writableModelId").then((modelId) => {
            H.createAction({
              ...SAMPLE_WRITABLE_QUERY_ACTION,
              model_id: modelId,
            });
            cy.signInAsImpersonatedUser();
            cy.visit(`/model/${modelId}/detail/actions`);
            cy.wait("@getModel");
          });

          cy.intercept("POST", "/api/action/*/execute").as(
            "executeImpersonatedAction",
          );
          runActionFor(SAMPLE_QUERY_ACTION.name);

          H.modal().within(() => {
            cy.findByLabelText(TEST_PARAMETER.name).type("1");
            cy.button(SAMPLE_QUERY_ACTION.name).click();

            cy.wait("@executeImpersonatedAction", { responseTimeout: 60_000 });
            cy.findByText(
              "Error executing Action: Error executing write query: ERROR: permission denied for table scoreboard_actions",
            );
          });

          H.queryWritableDB(
            `SELECT *
           FROM ${WRITABLE_TEST_TABLE}
           WHERE id = 1`,
            dialect,
          ).then((result) => {
            const row = result.rows[0];
            expect(row.score).to.equal(0);
          });
        });
      }
    },
  );
});

function runActionFor(actionName) {
  cy.findByRole("listitem", { name: actionName }).within(() => {
    cy.icon("play").click();
  });
  cy.wait("@getAction");
}

function openActionMenuFor(actionName) {
  cy.findByRole("listitem", { name: actionName }).within(() => {
    cy.icon("ellipsis").click();
  });
}

function assertQueryEditorDisabled() {
  H.NativeEditor.get().click();
  H.NativeEditor.get().should("not.be.focused");
  H.NativeEditor.get().should("have.attr", "contenteditable", "false");

  // Type straight into the page: the editor helper waits for focus, and this
  // editor is read only, so it never takes it.
  cy.realType("QWERTY");
  cy.findByText("QWERTY").should("not.exist");
}

function enablePublicSharing(actionId, { publicUrlAlias }) {
  cy.request("POST", `/api/action/${actionId}/public_link`).then(({ body }) => {
    cy.wrap(`/public/action/${body.uuid}`).as(publicUrlAlias);
  });
}

function disablePublicSharing(actionId) {
  cy.request("DELETE", `/api/action/${actionId}/public_link`);
}

function verifyScoreValue(value, dialect) {
  H.queryWritableDB(
    `SELECT * FROM ${WRITABLE_TEST_TABLE} WHERE id = 1`,
    dialect,
  ).then((result) => {
    const row = result.rows[0];

    expect(row.score).to.equal(value);
  });
}
