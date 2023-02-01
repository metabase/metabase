import {
  restore,
  queryTestDB,
  resetTestTable,
  getTableId,
  waitForSyncToFinish,
  fillActionQuery,
} from "__support__/e2e/helpers";

const DB_ID = 2;
const TEST_TABLE = "scoreboard_actions";

["mysql", "postgres"].forEach(dialect => {
  describe(`Write Actions on Dashboards (${dialect})`, () => {
    beforeEach(() => {
      cy.intercept("/api/card/*").as("getModel");

      cy.intercept("POST", "/api/dashboard/*/dashcard/*/execute").as(
        "executeAPI",
      );

      cy.intercept("GET", "/api/dashboard/*").as("dashboardLoad");

      resetTestTable({ type: dialect, table: TEST_TABLE });
      restore(`${dialect}-writable`);
      cy.signInAsAdmin();
      cy.request("POST", `/api/database/${DB_ID}/sync_schema`);
      cy.request("POST", `/api/database/${DB_ID}/rescan_values`);
      waitForSyncToFinish(0, DB_ID);
    });

    it("should show testing_db with actions enabled", () => {
      cy.visit("/admin/databases/2");
      cy.get("#model-actions-toggle").should("be.checked");
    });

    // this test is mostly to prove that we're actually reading from freshly reset data
    it("can read from the test table", () => {
      cy.visit("/browse/2");
      cy.findByText("Scoreboard Actions").click();

      cy.findByText("Generous Giraffes").should("be.visible");
      cy.findByText("Dusty Ducks").should("be.visible");
      cy.findByText("Lively Lemurs").should("be.visible");
      cy.findByText("Zany Zebras").should("not.exist");
    });

    it("adds a custom query action to a dashboard and runs it", () => {
      queryTestDB(
        `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
        dialect,
      ).then(result => {
        expect(result.rows.length).to.equal(0);
      });

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
        cy.findByText("Add Zebras").click();
      });
      cy.findByLabelText("click icon").click();

      cy.findByText("Add Zebras").should("be.visible");
      cy.findByText("Save").click();

      // this keeps the test from flaking because it's confused about the detached
      // edit-mode button
      cy.reload();

      cy.findByText("Add Zebras").click();

      cy.wait("@executeAPI");

      queryTestDB(
        `SELECT * FROM ${TEST_TABLE} WHERE team_name = 'Zany Zebras'`,
        dialect,
      ).then(result => {
        expect(result.rows.length).to.equal(1);
      });
    });
  });
});

const createModelFromTable = tableName => {
  getTableId({ name: tableName }).then(tableId => {
    cy.createQuestion(
      {
        database: 2,
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
