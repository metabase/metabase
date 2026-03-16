const { H } = cy;
import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createMockActionParameter,
  createMockParameter,
} from "metabase-types/api/mocks";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const viewports = [
  [768, 800],
  [1024, 800],
  [1440, 800],
];

describe("metabase#31587", () => {
  viewports.forEach(([width, height]) => {
    describe(`Testing on resolution ${width} x ${height}`, () => {
      beforeEach(() => {
        H.restore();
        cy.signInAsAdmin();
        H.setActionsEnabledForDB(SAMPLE_DB_ID);
        cy.viewport(width, height);
      });

      it("should not allow action buttons to overflow when editing dashboard", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
        cy.button("Add action").click();

        cy.findByTestId("dashboard-parameters-and-cards").within(() => {
          actionButtonContainer().then((actionButtonElem) => {
            dashCard().then((dashCardElem) => {
              expect(actionButtonElem[0].scrollHeight).to.eq(
                dashCardElem[0].scrollHeight,
              );
            });
          });
        });
      });

      it("should not allow action buttons to overflow when viewing info sidebar", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
        cy.findByLabelText("Add action").click();

        H.saveDashboard();
        cy.icon("info").click();

        cy.findByTestId("dashboard-parameters-and-cards").within(() => {
          actionButtonContainer().then((actionButtonElem) => {
            dashCard().then((dashCardElem) => {
              expect(actionButtonElem[0].scrollHeight).to.eq(
                dashCardElem[0].scrollHeight,
              );
            });
          });
        });
      });
    });
  });
});

describe("Issue 32974", { tags: ["@external", "@actions"] }, () => {
  const { ALL_USERS_GROUP } = USER_GROUPS;

  const TEST_TABLE = "scoreboard_actions";

  const ID_ACTION_PARAMETER = createMockActionParameter({
    id: "86981cc2-2589-44b5-b559-2c8bbf5bb36a",
    name: "ID",
    slug: "id",
    type: "number/=",
    target: ["variable", ["template-tag", "id"]],
  });

  const ID_DASHBOARD_PARAMETER = createMockParameter({
    name: "ID",
    slug: "id",
    id: "9da7bdd3",
    type: "id",
    sectionId: "id",
  });

  const DASHBOARD_DETAILS = {
    name: "action dashboard",
    parameters: [ID_DASHBOARD_PARAMETER],
  };

  const EXPECTED_UPDATED_VALUE = 999;

  const QUERY_ACTION = {
    name: "Query action",
    type: "query",
    parameters: [ID_ACTION_PARAMETER],
    database_id: WRITABLE_DB_ID,
    dataset_query: {
      type: "native",
      native: {
        query: `UPDATE ${TEST_TABLE} SET SCORE = ${EXPECTED_UPDATED_VALUE} WHERE ID = {{ ${ID_ACTION_PARAMETER.slug} }}`,
        "template-tags": {
          [ID_ACTION_PARAMETER.slug]: {
            id: ID_ACTION_PARAMETER.id,
            "display-name": ID_ACTION_PARAMETER.name,
            name: ID_ACTION_PARAMETER.slug,
            type: "text",
          },
        },
      },
      database: WRITABLE_DB_ID,
    },
    visualization_settings: {
      fields: {
        [ID_ACTION_PARAMETER.id]: {
          id: ID_ACTION_PARAMETER.id,
          required: true,
          fieldType: "number",
          inputType: "number",
        },
      },
    },
  };

  function setupWritableDB() {
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });

    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TEST_TABLE,
    });

    H.createModelFromTableName({
      tableName: TEST_TABLE,
      idAlias: "modelId",
    });

    H.setActionsEnabledForDB(WRITABLE_DB_ID, true);
  }

  function setupDashboardAndAction() {
    let fieldId;
    H.getTable({ databaseId: WRITABLE_DB_ID, name: TEST_TABLE }).then(
      (table) => {
        fieldId = table.fields.find((field) => field.name === "id").id;
      },
    );

    cy.get("@modelId").then((modelId) => {
      H.createImplicitActions({ modelId });

      H.createAction({ ...QUERY_ACTION, model_id: modelId }).then(
        ({ body: { id: actionId } }) => {
          cy.wrap(actionId).as("actionId");

          H.createDashboard(DASHBOARD_DETAILS).then(
            ({ body: { id: dashboardId } }) => {
              cy.wrap(dashboardId).as("dashboardId");

              H.updateDashboardCards({
                dashboard_id: dashboardId,
                cards: [
                  {
                    id: H.getNextUnsavedDashboardCardId(),
                    card_id: modelId,
                    // Map dashboard parameter to PRODUCTS.ID
                    parameter_mappings: [
                      {
                        parameter_id: ID_DASHBOARD_PARAMETER.id,
                        card_id: modelId,
                        target: ["dimension", ["field-id", fieldId, null]],
                      },
                    ],
                  },
                  H.getActionCardDetails({
                    label: QUERY_ACTION.name,
                    action_id: actionId,
                    // Map action's ID parameter to dashboard parameter
                    parameter_mappings: [
                      {
                        parameter_id: ID_DASHBOARD_PARAMETER.id,
                        target: [
                          "variable",
                          ["template-tag", ID_DASHBOARD_PARAMETER.slug],
                        ],
                      },
                    ],
                  }),
                ],
              });
            },
          );
        },
      );
    });
  }

  beforeEach(() => {
    cy.intercept("GET", "/api/action?model-id=*").as("getModelActions");
    cy.intercept("POST", "/api/action/*/execute").as("executeAction");
    cy.intercept("GET", "/api/action/*/execute?parameters=*").as(
      "prefetchValues",
    );

    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: TEST_TABLE });

    cy.signInAsAdmin();
    setupWritableDB();

    setupDashboardAndAction();
  });

  it("can submit query action linked with dashboard parameters (metabase#32974)", () => {
    H.visitDashboard("@dashboardId", { params: { id: 1 } });

    cy.log("Execute action");
    cy.button(QUERY_ACTION.name).click();
    H.modal().button(QUERY_ACTION.name).click();

    cy.log("Assertions");
    H.getDashboardCard().findByText(EXPECTED_UPDATED_VALUE).should("exist");
    H.modal().should("not.exist");
    H.undoToast().findByText("Query action ran successfully").should("exist");
  });
});

describe("issue 51020", () => {
  function setupDashboard({ questionName, modelName, columnName }) {
    H.newButton("Dashboard").click();
    H.modal().findByLabelText("Name").type("Dash");
    H.modal().button("Create").click();

    cy.button("Add a chart").click();
    cy.findByTestId("add-card-sidebar").findByText(questionName).click();

    cy.findByLabelText("Add a filter or parameter").click();
    H.popover().findByText("ID").click();
    H.getDashboardCard().findByText("Select…").click();
    H.popover().findAllByText(columnName).eq(0).click();
    cy.button("Done").click();

    H.getDashboardCard().realHover().icon("click").click();
    cy.get("aside").within(() => {
      cy.findByText(columnName).click();
      cy.findByText("Update a dashboard filter").click();
      cy.findByTestId("click-target-column").click();
    });
    H.popover().findByText(columnName).click();
    cy.button("Done").click();

    cy.findByLabelText("Add action").click();
    cy.button("Pick an action").click();
    H.modal().within(() => {
      cy.findByText(modelName).click();
      cy.findByText("Update").click();
      cy.findAllByText("Ask the user").eq(0).click();
    });
    H.popover().findByText("ID").click();
    cy.button("Done").click();

    H.saveDashboard();
  }

  describe("when primary key is called 'id'", () => {
    function createTemporaryTable() {
      H.queryWritableDB(
        "CREATE TABLE IF NOT EXISTS foo (id INT PRIMARY KEY, name VARCHAR)",
      );
      H.queryWritableDB(
        "INSERT INTO foo (id, name) VALUES (1, 'Foo'), (2, 'Bar')",
      );
    }

    function dropTemporaryTable() {
      H.queryWritableDB("ALTER TABLE IF EXISTS foo DROP CONSTRAINT foo_pkey");
      H.queryWritableDB("DROP TABLE IF EXISTS foo");
    }

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      dropTemporaryTable();
      createTemporaryTable();
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "foo" });

      H.getTableId({ name: "foo" }).then((tableId) => {
        H.createQuestion(
          {
            name: "Model 51020",
            type: "model",
            database: WRITABLE_DB_ID,
            query: {
              "source-table": tableId,
            },
          },
          {
            visitQuestion: true,
          },
        );
      });
      setupBasicActionsInModel();
      setupDashboard({
        modelName: "Model 51020",
        questionName: "Model 51020",
        columnName: "ID",
      });
    });

    afterEach(() => {
      dropTemporaryTable();
    });

    it("should pass primary key attribute to execute action endpoint when primary key is called 'id' and it's populated with click behavior or URL (metabase#51020)", () => {
      cy.log(
        "check when primary key parameter is populated with click behavior",
      );
      H.getDashboardCard(0).findAllByText("1").eq(0).click();
      H.getDashboardCard(1).findByText("Click Me").click();
      H.modal().findByLabelText("Name").type(" Baz");
      H.modal().button("Update").click();

      H.modal().should("not.exist");
      H.undoToast().findByText("Successfully updated").should("be.visible");
      H.getDashboardCard(0).should("contain.text", "Foo Baz");

      cy.log("check when primary key parameter is populated with URL");
      cy.reload();
      H.getDashboardCard(1).findByText("Click Me").click();
      H.modal().findByLabelText("Name").type(" Baz");
      H.modal().button("Update").click();

      H.modal().should("not.exist");
      H.undoToast().findByText("Successfully updated").should("be.visible");
      H.getDashboardCard(0).should("contain.text", "Foo Baz Baz");
    });
  });

  describe("when primary key is not called 'id'", { tags: "@external" }, () => {
    function createTemporaryTable() {
      H.queryWritableDB(
        "CREATE TABLE IF NOT EXISTS foo (foo INT PRIMARY KEY, name VARCHAR)",
      );
      H.queryWritableDB(
        "INSERT INTO foo (foo, name) VALUES (1, 'Foo'), (2, 'Bar')",
      );
    }

    function dropTemporaryTable() {
      H.queryWritableDB("ALTER TABLE IF EXISTS foo DROP CONSTRAINT foo_pkey");
      H.queryWritableDB("DROP TABLE IF EXISTS foo");
    }

    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.intercept("POST", "/api/card").as("createCard");
      cy.intercept("GET", "/api/card/*").as("getCard");

      H.restore("postgres-writable");
      cy.signInAsAdmin();

      dropTemporaryTable();
      createTemporaryTable();
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "foo" });

      cy.visit("/model/new");
      cy.findByTestId("new-model-options")
        .findByText("Use the notebook editor")
        .click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        /**
         * Without this wait, typing speed causes flakiness: fast typing switches to search tab
         * before picker content loads, so no folder is selected and "Everywhere" toggle doesn't appear.
         */
        cy.findByTestId("single-picker-view").should("be.visible");
        cy.findByRole("searchbox").type("foo");
        cy.findByText("Everywhere").click();
        cy.findByText("Foo").click();
      });

      cy.findByTestId("run-button").click();
      cy.wait("@dataset");
      cy.button("Save").click();
      H.modal().findByLabelText("Name").clear().type("Model 51020");
      H.modal().button("Save").click();
      cy.wait("@createCard");
      cy.wait("@getCard");
      setupBasicActionsInModel();

      H.newButton("Question").click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModalItem(0, "Our analytics").click();
      H.entityPickerModalItem(1, "Model 51020").click();
      H.saveQuestion("Question 51020", undefined, {
        path: ["Our analytics"],
      });

      setupDashboard({
        modelName: "Model 51020",
        questionName: "Question 51020",
        columnName: "Foo",
      });
    });

    afterEach(() => {
      dropTemporaryTable();
    });

    it("should pass primary key attribute to execute action endpoint when primary key isn't called 'id' and it's populated with click behavior or URL (metabase#51020)", () => {
      cy.log(
        "check when primary key parameter is populated with click behavior",
      );
      H.getDashboardCard(0).findAllByText("1").eq(0).click();
      H.getDashboardCard(1).findByText("Click Me").click();
      H.modal().findByLabelText("Name").type(" Baz");
      H.modal().button("Update").click();

      H.modal().should("not.exist");
      H.undoToast().findByText("Successfully updated").should("be.visible");
      H.getDashboardCard(0).should("contain.text", "Foo Baz");

      cy.log("check when primary key parameter is populated with URL");
      cy.reload();
      H.getDashboardCard(1).findByText("Click Me").click();
      H.modal().findByLabelText("Name").type(" Baz");
      H.modal().button("Update").click();

      H.modal().should("not.exist");
      H.undoToast().findByText("Successfully updated").should("be.visible");
      H.getDashboardCard(0).should("contain.text", "Foo Baz Baz");
    });
  });
});

describe("issue 32840", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);

    H.createQuestion(
      {
        type: "model",
        name: "Products model",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
      {
        wrapId: true,
        idAlias: "modelId",
      },
    );

    cy.get("@modelId").then((modelId) => {
      H.createAction({
        type: "implicit",
        kind: "row/update",
        name: "Update",
        model_id: modelId,
      });
      H.visitModel(modelId);
    });

    cy.intercept("POST", "/api/action/*/execute").as("executeAction");
  });

  it("uses correct timestamp when executing implicit update action (metabase#32840)", () => {
    cy.findAllByTestId("cell-data").eq(8).click();
    H.modal().within(() => {
      cy.findByText("July 19, 2023, 7:44 PM").should("be.visible");
      cy.findByTestId("actions-menu").click();
    });
    H.popover().findByText("Update").should("be.visible").click();
    H.modal()
      .eq(1)
      .within(() => {
        cy.findByPlaceholderText("Created At").should(
          "have.value",
          "2023-07-19T19:44:56",
        );
        cy.button("Update").scrollIntoView().click();
      });
    cy.wait("@executeAction");
    H.modal().findByText("July 19, 2023, 7:44 PM").should("be.visible");
  });
});

describe("issue 32750", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setActionsEnabledForDB(SAMPLE_DB_ID);
    cy.visit("/");
  });

  it("modal do not dissapear on viewport change", () => {
    H.startNewAction();
    cy.viewport(320, 800);
    cy.findByTestId("action-creator").should("be.visible");
    cy.viewport(1440, 800);
    cy.findByTestId("action-creator").should("be.visible");
  });
});

function setupBasicActionsInModel() {
  H.questionInfoButton().click();
  H.sidesheet().findByText("Actions").click();
  cy.button(/Create basic actions/).click();
}

const actionButtonContainer = () =>
  cy.findByTestId("action-button-full-container");

const dashCard = () =>
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy
    .findAllByTestId("dashcard-container")
    .last()
    .should("have.text", "Click Me");
