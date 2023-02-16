import {
  restore,
  queryWritableDB,
  resetTestTable,
  getTableId,
  fillActionQuery,
  resyncDatabase,
} from "__support__/e2e/helpers";

import { WRITABLE_DB_ID } from "__support__/e2e/cypress_data";

const TEST_TABLE = "scoreboard_actions";

["mysql", "postgres"].forEach(dialect => {
  describe(
    `Write Actions on Dashboards (${dialect})`,
    { tags: ["@external", "@actions"] },
    () => {
      beforeEach(() => {
        cy.intercept("/api/card/*").as("getModel");

        cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
          "executeAPI",
        );

        cy.intercept("GET", "/api/dashboard/*").as("dashboardLoad");

        resetTestTable({ type: dialect, table: TEST_TABLE });
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();
        resyncDatabase(WRITABLE_DB_ID);
      });

      it("should show writable_db with actions enabled", () => {
        cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
        cy.get("#model-actions-toggle").should("be.checked");
      });

      // this test is mostly to prove that we're actually reading from freshly reset data
      it("can read from the test table", () => {
        cy.visit(`/browse/${WRITABLE_DB_ID}`);
        cy.findByText("Scoreboard Actions").click();

        cy.findByText("Generous Giraffes").should("be.visible");
        cy.findByText("Dusty Ducks").should("be.visible");
        cy.findByText("Lively Lemurs").should("be.visible");
        cy.findByText("Zany Zebras").should("not.exist");
      });

      it("adds a custom query action to a dashboard and runs it", () => {
        queryWritableDB(
          `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
          dialect,
        ).then(result => {
          expect(result.rows.length).to.equal(0);
        });
        cy.visit("/");

        createModelFromTable(TEST_TABLE);

        cy.get("@modelId").then(id => {
          cy.visit(`/model/${id}/detail`);
          cy.wait("@getModel");
        });

        cy.visit("/model/4-test-model/detail");
        cy.findByText("Actions").click();
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
            cy.visit(`/dashboard/${dashboardId}`);
          },
        );

        cy.findByLabelText("pencil icon").click();
        cy.findByLabelText("click icon").click();
        cy.get("aside").within(() => {
          cy.findByText("Pick an action").click();
        });

        cy.findByRole("dialog").within(() => {
          cy.findByText("Test Model").click();
          cy.findByText("Add Zebras").click();
          cy.findByRole("button", { name: "Done" }).click();
        });

        cy.findByText("Save").click();

        // this keeps the test from flaking because it's confused about the detached
        // edit-mode button
        cy.reload();

        cy.findByText("Click Me").click();

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
