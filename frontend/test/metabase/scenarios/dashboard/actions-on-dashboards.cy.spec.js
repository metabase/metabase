import { many_data_types_data } from "__support__/e2e/test_tables_data";
import {
  restore,
  queryWritableDB,
  resetTestTable,
  getTableId,
  fillActionQuery,
  resyncDatabase,
  visitDashboard,
  editDashboard,
  saveDashboard,
  modal,
  setFilter,
  sidebar,
  popover,
  filterWidget,
  createImplicitAction,
} from "__support__/e2e/helpers";

import { WRITABLE_DB_ID } from "__support__/e2e/cypress_data";

import { addWidgetStringFilter } from "../native-filters/helpers/e2e-field-filter-helpers";

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Test Action Model";

["mysql", "postgres"].forEach(dialect => {
  describe(
    `Write Actions on Dashboards (${dialect})`,
    { tags: ["@external", "@actions"] },
    () => {
      beforeEach(() => {
        cy.intercept("GET", /\/api\/card\/\d+/).as("getModel");
        cy.intercept("GET", "/api/card?f=using_model&model_id=**").as(
          "getCardAssociations",
        );
        cy.intercept("GET", "/api/action?model-id=*").as("getActions");

        cy.intercept(
          "GET",
          "/api/dashboard/*/dashcard/*/execute?parameters=*",
        ).as("executePrefetch");

        cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
          "executeAPI",
        );

        resetTestTable({ type: dialect, table: TEST_TABLE });
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();
        resyncDatabase(WRITABLE_DB_ID);
      });

      it("adds a custom query action to a dashboard and runs it", () => {
        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(0);
        });

        createModelFromTable(TEST_TABLE);

        cy.get("@modelId").then(id => {
          cy.visit(`/model/${id}/detail`);
          cy.wait(["@getModel", "@getActions", "@getCardAssociations"]);
        });

        cy.findByRole("tab", { name: "Actions" }).click();
        cy.findByText("New action").click();

        cy.findByRole("dialog").within(() => {
          fillActionQuery(
            `INSERT INTO ${TEST_TABLE} (team_name) VALUES ('Zany Zebras')`,
          );
          cy.findByText("Save").click();
        });

        cy.findByPlaceholderText("My new fantastic action").type("Add Zebras");
        cy.findByText("Create").click();

        createDashboardWithActionButton({
          actionName: "Add Zebras",
        });

        cy.button("Add Zebras").click();

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);
        });
      });

      it("adds an implicit create action to a dashboard and runs it", () => {
        createModelFromTable(TEST_TABLE);
        cy.get("@modelId").then(id => {
          createImplicitAction({
            kind: "create",
            model_id: id,
          });
        });

        createDashboardWithActionButton({
          actionName: "Create",
        });

        cy.button("Create").click();

        modal().within(() => {
          cy.findByPlaceholderText("Team name").type("Zany Zebras");
          cy.findByPlaceholderText("Score").type("44");

          cy.button("Save").click();
        });

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);

          expect(result.rows[0].score).to.equal(44);
        });
      });

      it("adds an implicit update action to a dashboard and runs it", () => {
        const actionName = "Update";

        createModelFromTable(TEST_TABLE);

        cy.get("@modelId").then(id => {
          createImplicitAction({
            kind: "update",
            model_id: id,
          });
        });

        createDashboardWithActionButton({
          actionName,
          idFilter: true,
        });

        filterWidget().click();
        addWidgetStringFilter("5");

        cy.button(actionName).click();

        cy.wait("@executePrefetch");
        // let's check that the existing values are pre-filled correctly
        modal().within(() => {
          cy.findByPlaceholderText("Team name")
            .should("have.value", "Energetic Elephants")
            .clear()
            .type("Emotional Elephants");

          cy.findByPlaceholderText("Score")
            .should("have.value", "30")
            .clear()
            .type("88");

          cy.button("Update").click();
        });

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Emotional Elephants'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);

          expect(result.rows[0].score).to.equal(88);
        });
      });

      it("adds an implicit delete action to a dashboard and runs it", () => {
        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);
          expect(result.rows[0].id).to.equal(3);
        });

        createModelFromTable(TEST_TABLE);

        cy.get("@modelId").then(id => {
          createImplicitAction({
            kind: "delete",
            model_id: id,
          });
        });

        createDashboardWithActionButton({
          actionName: "Delete",
        });

        cy.button("Delete").click();

        modal().within(() => {
          cy.findByPlaceholderText("Id").type("3");
          cy.button("Delete").click();
        });

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(0);
        });
      });
    },
  );

  describe(
    `Actions Data Types (${dialect})`,
    { tags: ["@external", "@actions"] },
    () => {
      beforeEach(() => {
        cy.intercept("GET", /\/api\/card\/\d+/).as("getModel");
        cy.intercept("GET", "/api/card?f=using_model&model_id=**").as(
          "getCardAssociations",
        );
        cy.intercept("GET", "/api/action?model-id=*").as("getActions");

        cy.intercept(
          "GET",
          "/api/dashboard/*/dashcard/*/execute?parameters=*",
        ).as("executePrefetch");

        cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
          "executeAPI",
        );

        resetTestTable({ type: dialect, table: TEST_COLUMNS_TABLE });
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();
        resyncDatabase(WRITABLE_DB_ID);
        cy.wait(300);
      });

      it("can update various data types via implicit actions", () => {
        createModelFromTable(TEST_COLUMNS_TABLE);
      it("adds an implicit create action to a dashboard and runs it", () => {
        createModelFromTable(TEST_TABLE);
        cy.get("@modelId").then(id => {
          cy.request({
            url: "/api/action",
            method: "POST",
            body: {
              kind: "row/update",
              name: "Update",
              kind: "row/create",
              name: "Create",
              type: "implicit",
              model_id: id,
            },
          });
        });

        createDashboardWithActionButton({
          actionName: "Create",
        });

        cy.button("Create").click();

        modal().within(() => {
          cy.findByPlaceholderText("team_name").type("Zany Zebras");
          cy.findByPlaceholderText("score").type("44");

          cy.button("Save").click();
        });

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);

          expect(result.rows[0].score).to.equal(44);
        });
      });

      it("adds an implicit update action to a dashboard and runs it", () => {
        const actionName = "Update";

        createModelFromTable(TEST_TABLE);

        cy.get("@modelId").then(id => {
          createImplicitAction({
            kind: "update",
            model_id: id,
          });
        });

        createDashboardWithActionButton({
          actionName,
          idFilter: true,
        });

        filterWidget().click();
        addWidgetStringFilter("5");

        cy.button(actionName).click();

        cy.wait("@executePrefetch");
        // let's check that the existing values are pre-filled correctly
        modal().within(() => {
          cy.findByPlaceholderText("team_name")
            .should("have.value", "Energetic Elephants")
            .clear()
            .type("Emotional Elephants");

          cy.findByPlaceholderText("score")
            .should("have.value", "30")
            .clear()
            .type("88");

          cy.button("Update").click();
        });

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Emotional Elephants'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);

          expect(result.rows[0].score).to.equal(88);
        });
      });

      it("adds an implicit delete action to a dashboard and runs it", () => {
        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);
          expect(result.rows[0].id).to.equal(3);
        });


        createModelFromTable(TEST_TABLE);
        cy.get("@modelId").then(id => {
          createImplicitAction({
            kind: "delete",
            model_id: id,
          });
        });

        createDashboardWithActionButton({
          actionName: "Delete",
        });

        cy.button("Delete").click();

        modal().within(() => {
          cy.findByPlaceholderText("id").type("3");
          cy.button("Delete").click();
        });

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Cuddly Cats'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(0);
        });
      });
    },
  );
});

const createModelFromTable = tableName => {
  getTableId({ name: tableName }).then(tableId => {
    cy.createQuestion(
      {
        database: WRITABLE_DB_ID,
        name: MODEL_NAME,
        query: {
          "source-table": tableId,
        },
        dataset: true,
      },
      {
        wrapId: true,
        idAlias: "modelId",
      },
    );
  });
};

function createDashboardWithActionButton({
  actionName,
  modelName = MODEL_NAME,
  idFilter = false,
}) {
  cy.createDashboard({ name: "action packed dashboard" }).then(
    ({ body: { id: dashboardId } }) => {
      visitDashboard(dashboardId);
    },
  );

  editDashboard();

  if (idFilter) {
    setFilter("ID");
    sidebar().within(() => {
      cy.button("Done").click();
    });
  }

  cy.button("Add action").click();
  cy.get("aside").within(() => {
    cy.findByPlaceholderText("Button text").clear().type(actionName);
    cy.button("Pick an action").click();
  });

  cy.findByRole("dialog").within(() => {
    cy.findByText(modelName).click();
    cy.findByText(actionName).click();
  });

  if (idFilter) {
    cy.findByRole("dialog").within(() => {
      cy.findAllByText(/ask the user/i)
        .first()
        .click();
    });
    popover().within(() => {
      cy.findByText("ID").click();
    });
  }

  cy.findByRole("dialog").within(() => {
    cy.button("Done").click();
  });

  saveDashboard();
}

const changeValue = ({ fieldName, fieldType, oldValue, newValue }) => {
  cy.findByPlaceholderText(fieldName)
    .should("have.attr", "type", fieldType)
    .should("have.value", oldValue)
    .clear()
    .type(newValue);
};
