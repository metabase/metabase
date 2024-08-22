import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  createQuestion,
  describeEE,
  onlyOnOSS,
  queryWritableDB,
  resetTestTable,
  restore,
  resyncDatabase,
  setTokenFeatures,
} from "e2e/support/helpers";

import { createNativeQuestion } from "../../../support/helpers/api/createNativeQuestion";

const TEST_TABLE = "scoreboard_actions";

describeEE("query validator", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-writable");
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  describe("fields", () => {
    it("picks up inactive and unknown fields", () => {
      resetTestTable({ type: "postgres", table: TEST_TABLE });
      resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: TEST_TABLE,
      });

      createNativeQuestion({
        name: "Native inactive field",
        native: { query: "Select team_name from scoreboard_actions" },
        display: "table",
        database: WRITABLE_DB_ID,
      });

      createNativeQuestion({
        name: "Native unknown field",
        native: { query: "Select foo from scoreboard_actions" },
        display: "table",
        database: WRITABLE_DB_ID,
      });

      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
        ({ body: tables }) => {
          const scoreboardTable = tables.find(
            table => table.name === TEST_TABLE,
          );

          cy.request(`/api/table/${scoreboardTable.id}/query_metadata`).then(
            ({ body: { fields } }) => {
              const teamNameField = fields.find(
                field => field.name === "team_name",
              );

              createQuestion({
                name: "Structured inactive field",
                query: {
                  "source-table": scoreboardTable.id,
                  fields: [["field", teamNameField.id]],
                },
                display: "table",
                database: WRITABLE_DB_ID,
              });
            },
          );
        },
      );

      queryWritableDB(
        `ALTER TABLE ${TEST_TABLE} RENAME COLUMN team_name TO team_name_`,
      );

      resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: TEST_TABLE,
      });

      cy.visit("/admin/troubleshooting/query-validator");

      cy.findAllByRole("row")
        .contains("tr", "Native inactive field")
        .and("contain.text", "Field team_name is inactive");

      cy.findAllByRole("row")
        .contains("tr", "Native unknown field")
        .and("contain.text", "Field foo is unknown");

      cy.findAllByRole("row")
        .contains("tr", "Structured inactive field")
        .and("contain.text", "Field team_name is inactive");
    });
  });

  describe("tables", () => {
    it("should pick up inactive and unknown tables", () => {
      resetTestTable({ type: "postgres", table: TEST_TABLE });
      resyncDatabase(WRITABLE_DB_ID);

      createNativeQuestion({
        name: "Native inactive table",
        native: { query: "Select team_name from scoreboard_actions" },
        display: "table",
        database: WRITABLE_DB_ID,
      });

      createNativeQuestion({
        name: "Native unknown table",
        native: { query: "Select * from electric_bugaloo" },
        display: "line",
      });

      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
        ({ body: tables }) => {
          const scoreboardTable = tables.find(
            table => table.name === TEST_TABLE,
          );

          cy.request(`/api/table/${scoreboardTable.id}/query_metadata`).then(
            ({ body: { fields } }) => {
              const teamNameField = fields.find(
                field => field.name === "team_name",
              );

              createQuestion({
                name: "Structured inactive table",
                query: {
                  "source-table": scoreboardTable.id,
                  fields: [["field", teamNameField.id]],
                },
                display: "table",
                database: WRITABLE_DB_ID,
              });
            },
          );
        },
      );

      queryWritableDB(`DROP TABLE ${TEST_TABLE}`);

      resyncDatabase(WRITABLE_DB_ID);
      cy.visit("/admin/troubleshooting/query-validator");

      cy.findAllByRole("row")
        .contains("tr", "Native inactive table")
        .and("contain.text", "Table scoreboard_actions is inactive");

      cy.findAllByRole("row")
        .contains("tr", "Native unknown table")
        .and("contain.text", "Table electric_bugaloo is unknown");

      cy.findAllByRole("row")
        .contains("tr", "Structured inactive table")
        .and("contain.text", "Table scoreboard_actions is inactive");
    });
  });
});

describe("OSS", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore();
    cy.signInAsAdmin();
  });

  it("should not be present in OSS", () => {
    cy.visit("/admin/troubleshooting");
    cy.findByTestId("admin-layout-sidebar").should(
      "not.contain",
      "Query Validator",
    );
  });
});
