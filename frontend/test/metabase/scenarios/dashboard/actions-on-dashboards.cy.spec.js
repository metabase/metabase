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
} from "__support__/e2e/helpers";

import { WRITABLE_DB_ID } from "__support__/e2e/cypress_data";

const TEST_TABLE = "scoreboard_actions";

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

        cy.createDashboard({ name: `action packed dash` }).then(
          ({ body: { id: dashboardId } }) => {
            visitDashboard(dashboardId);
          },
        );

        editDashboard();
        cy.icon("click").click();
        cy.get("aside").within(() => {
          cy.button("Pick an action").click();
        });

        cy.findByRole("dialog").within(() => {
          cy.findByText("Test Model").click();
          cy.findByText("Add Zebras").click();
          cy.button("Done").click();
        });

        saveDashboard();

        // this keeps the test from flaking because it's confused about the detached
        // edit-mode button
        cy.findByText(/^Edited a few seconds ago/).should("not.be.visible");

        cy.button("Click Me").click();

        cy.wait("@executeAPI");

        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(1);
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
        name: "Test Model",
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
