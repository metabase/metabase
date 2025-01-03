import { H } from "e2e/support";
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockActionParameter,
  createMockParameter,
} from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

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
          const actionButtonContainer = cy.findByTestId(
            "action-button-full-container",
          );
          const dashCard = cy
            .findAllByTestId("dashcard-container")
            .last()
            .should("have.text", "Click Me");

          actionButtonContainer.then(actionButtonElem => {
            dashCard.then(dashCardElem => {
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
          const actionButtonContainer = cy.findByTestId(
            "action-button-full-container",
          );
          const dashCard = cy
            .findAllByTestId("dashcard-container")
            .last()
            .should("have.text", "Click Me");

          actionButtonContainer.then(actionButtonElem => {
            dashCard.then(dashCardElem => {
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
  const TEST_TABLE = "PRODUCTS";

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

  const MODEL_DETAILS = {
    name: "Products model",
    query: { "source-table": PRODUCTS_ID },
    database: SAMPLE_DB_ID,
    type: "model",
  };

  const EXPECTED_UPDATED_VALUE = 999;

  const QUERY_ACTION = {
    name: "Query action",
    type: "query",
    parameters: [ID_ACTION_PARAMETER],
    database_id: SAMPLE_DB_ID,
    dataset_query: {
      type: "native",
      native: {
        query: `UPDATE ${TEST_TABLE} SET PRICE = ${EXPECTED_UPDATED_VALUE} WHERE ID = {{ ${ID_ACTION_PARAMETER.slug} }}`,
        "template-tags": {
          [ID_ACTION_PARAMETER.slug]: {
            id: ID_ACTION_PARAMETER.id,
            "display-name": ID_ACTION_PARAMETER.name,
            name: ID_ACTION_PARAMETER.slug,
            type: "text",
          },
        },
      },
      database: SAMPLE_DB_ID,
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

  function setupDashboard() {
    cy.createDashboard(DASHBOARD_DETAILS).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      H.updateDashboardCards({
        dashboard_id: this.dashboardId,
        cards: [
          {
            id: H.getNextUnsavedDashboardCardId(),
            card_id: this.modelId,
            // Map dashboard parameter to PRODUCTS.ID
            parameter_mappings: [
              {
                parameter_id: ID_DASHBOARD_PARAMETER.id,
                card_id: this.modelId,
                target: ["dimension", ["field-id", PRODUCTS.ID, null]],
              },
            ],
          },
          H.getActionCardDetails({
            label: QUERY_ACTION.name,
            action_id: this.actionId,
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
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.createQuestion(MODEL_DETAILS, {
      wrapId: true,
      idAlias: "modelId",
    });
    H.setActionsEnabledForDB(SAMPLE_DB_ID, true);
  });

  it("can submit query action linked with dashboard parameters (metabase#32974)", () => {
    cy.get("@modelId").then(modelId => {
      H.createAction({ ...QUERY_ACTION, model_id: modelId }).then(
        ({ body: { id: actionId } }) => {
          cy.wrap(actionId).as("actionId");
        },
      );
    });

    setupDashboard();

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
  function setupBasicActionsInModel() {
    H.questionInfoButton().click();
    H.modal().findByText("See more about this model").click();
    cy.findByRole("tab", { name: "Actions" }).click();
    cy.button(/Create basic actions/).click();
  }

  function setupDashboard({ questionName, modelName, columnName }) {
    H.newButton("Dashboard").click();
    H.modal().findByLabelText("Name").type("Dash");
    H.modal().button("Create").click();

    cy.button("Add a saved question").click();
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
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.setActionsEnabledForDB(SAMPLE_DB_ID);

      H.visitModel(ORDERS_MODEL_ID);
      setupBasicActionsInModel();
      setupDashboard({
        modelName: "Orders Model",
        questionName: "Orders Model",
        columnName: "ID",
      });
    });

    it("should pass primary key attribute to execute action endpoint when it's populated with click behavior or URL (metabase#51020)", () => {
      cy.log(
        "check when primary key parameter is populated with click behavior",
      );
      H.getDashboardCard(0).findAllByText("1").eq(0).click();
      H.getDashboardCard(1).findByText("Click Me").click();
      H.modal().findByLabelText("Discount").type("987");
      H.modal().button("Update").click();

      H.modal().should("not.exist");
      H.undoToast().findByText("Successfully updated").should("be.visible");
      H.getDashboardCard(0).should("contain.text", "987");

      cy.log("check when primary key parameter is populated with URL");
      cy.reload();
      H.getDashboardCard(1).findByText("Click Me").click();
      H.modal()
        .findByLabelText("Discount")
        .type("{backspace}{backspace}{backspace}654");
      H.modal().button("Update").click();

      H.modal().should("not.exist");
      H.undoToast().findByText("Successfully updated").should("be.visible");
      H.getDashboardCard(0).should("contain.text", "654");
    });
  });

  describe("when primary key is not called 'id'", () => {
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

      cy.visit("/");
      H.newButton("Model").click();
      cy.findByTestId("new-model-options")
        .findByText("Use the notebook editor")
        .click();
      H.entityPickerModalTab("Collections").click();
      H.entityPickerModal().within(() => {
        cy.findByPlaceholderText("Search this collection or everywhere…").type(
          "foo",
        );
        cy.findByText("Everywhere").click();
        cy.findByText("Foo").click();
      });
      cy.findByTestId("run-button").click();
      cy.wait("@dataset");
      cy.button("Save").click();
      H.modal()
        .findByLabelText("Name")
        .type("{backspace}{backspace}{backspace}Model 51020");
      H.modal().button("Save").click();
      cy.wait("@createCard");
      cy.wait("@getCard");
      setupBasicActionsInModel();

      H.newButton("Question").click();
      H.entityPickerModalTab("Collections").click();
      H.entityPickerModalItem(1, "Model 51020").click();
      H.saveQuestion("Question 51020", undefined, {
        tab: "Browse",
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

    it("should pass primary key attribute to execute action endpoint when it's populated with click behavior or URL (metabase#51020)", () => {
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
