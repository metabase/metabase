import { assocIn } from "icepick";
import {
  setActionsEnabledForDB,
  modal,
  popover,
  restore,
  fillActionQuery,
  createAction,
  navigationSidebar,
  openNavigationSidebar,
  resetTestTable,
  resyncDatabase,
  createModelFromTableName,
  queryWritableDB,
} from "e2e/support/helpers";

import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";

import { createMockActionParameter } from "metabase-types/api/mocks";

const PG_DB_ID = 2;
const PG_ORDERS_TABLE_ID = 9;
const WRITABLE_TEST_TABLE = "scoreboard_actions";

const SAMPLE_ORDERS_MODEL = {
  name: "Order",
  dataset: true,
  display: "table",
  database: PG_DB_ID,
  query: {
    "source-table": PG_ORDERS_TABLE_ID,
  },
};

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
  database_id: PG_DB_ID,
  dataset_query: {
    type: "native",
    native: {
      query: `UPDATE ORDERS SET TOTAL = TOTAL WHERE ID = {{ ${TEST_TEMPLATE_TAG.name} }}`,
      "template-tags": {
        [TEST_TEMPLATE_TAG.name]: TEST_TEMPLATE_TAG,
      },
    },
    database: PG_DB_ID,
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
      setActionsEnabledForDB(PG_DB_ID);

      cy.createQuestion(SAMPLE_ORDERS_MODEL, {
        wrapId: true,
        idAlias: "modelId",
      });

      cy.intercept("GET", "/api/card/*").as("getModel");
      cy.intercept("PUT", "/api/action/*").as("updateAction");
    });

    it("should allow CRUD operations on model actions", () => {
      cy.get("@modelId").then(id => {
        cy.visit(`/model/${id}/detail`);
        cy.wait("@getModel");
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Actions").click();

      cy.findByRole("button", { name: /Create basic actions/i }).click();
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
      modal().within(() => {
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
      cy.findByLabelText("Action list").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Create").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Update").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Delete").should("not.exist");

      openNavigationSidebar();
      navigationSidebar().within(() => {
        cy.icon("ellipsis").click();
      });
      popover().findByText("View archive").click();

      getArchiveListItem("Delete Order").within(() => {
        cy.icon("unarchive").click({ force: true });
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Delete Order").should("not.exist");
      cy.findByRole("button", { name: "Undo" }).click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Delete Order").should("be.visible");
      getArchiveListItem("Delete Order").within(() => {
        cy.icon("trash").click({ force: true });
      });
      cy.findByTestId("Delete Order").should("not.exist");
      cy.findByRole("button", { name: "Undo" }).should("not.exist");
    });

    it("should allow to create an action with the New button", () => {
      const QUERY = "UPDATE orders SET discount = {{ discount }}";
      cy.visit("/");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New").click();
      popover().findByText("Action").click();

      fillActionQuery(QUERY);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/New Action/)
        .clear()
        .type("Discount order");
      cy.findByRole("button", { name: "Save" }).click();
      modal().within(() => {
        cy.findByText("Select a model").click();
      });
      popover().findByText(SAMPLE_ORDERS_MODEL.name).click();
      cy.findByRole("button", { name: "Create" }).click();

      cy.get("@modelId").then(modelId => {
        cy.url().should("include", `/model/${modelId}/detail/actions`);
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Discount order").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(QUERY).should("be.visible");
    });

    it("should respect permissions", () => {
      // Enabling actions for sample database as well
      // to test database picker behavior in the action editor
      setActionsEnabledForDB(SAMPLE_DB_ID);

      cy.updatePermissionsGraph({
        [USER_GROUPS.ALL_USERS_GROUP]: {
          [PG_DB_ID]: { data: { schemas: "none", native: "none" } },
        },
        [USER_GROUPS.DATA_GROUP]: {
          [PG_DB_ID]: { data: { schemas: "all", native: "write" } },
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
      cy.findByRole("dialog").findByText("QA Postgres12").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sample Database").should("not.exist");
    });

    it("should display parameters for variable template tags only", () => {
      cy.visit("/");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New").click();
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
  },
);

["postgres", "mysql"].forEach(dialect => {
  describe(`Write actions on model detail page (${dialect})`, () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/card/*").as("getModel");

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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`${SAMPLE_QUERY_ACTION.name} ran successfully`).should(
        "be.visible",
      );

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
  modal().within(() => {
    cy.findByText("Disable this public link?").should("be.visible");
    cy.findByRole("button", { name: "Yes" }).click();
  });
  cy.findByRole("dialog").within(() => {
    cy.button("Cancel").click();
  });
}

function getArchiveListItem(itemName) {
  return cy.findByTestId(`archive-item-${itemName}`);
}
