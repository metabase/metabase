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

const SCOREBOARD_TABLE = "scoreboard_actions";
const COLORS_TABLE = "colors27745";

describeEE("query validator", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-writable");
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("picks up inactive and unknown fields and tables", () => {
    resetTestTable({ type: "postgres", table: SCOREBOARD_TABLE });
    resetTestTable({ type: "postgres", table: COLORS_TABLE });

    resyncDatabase({
      dbId: WRITABLE_DB_ID,
    });

    createNativeQuestion({
      name: "Native inactive field",
      native: { query: `Select team_name from ${SCOREBOARD_TABLE}` },
      display: "table",
      database: WRITABLE_DB_ID,
    });

    createNativeQuestion({
      name: "Native unknown field",
      native: { query: `Select foo from ${SCOREBOARD_TABLE}` },
      display: "table",
      database: WRITABLE_DB_ID,
    });

    createNativeQuestion({
      name: "Native inactive table",
      native: { query: `Select team_name from ${COLORS_TABLE}` },
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
          table => table.name === SCOREBOARD_TABLE,
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

    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
      ({ body: tables }) => {
        const colorsTable = tables.find(table => table.name === COLORS_TABLE);

        cy.request(`/api/table/${colorsTable.id}/query_metadata`).then(
          ({ body: { fields } }) => {
            const colorNameField = fields.find(field => field.name === "name");

            createQuestion({
              name: "Structured inactive table",
              query: {
                "source-table": colorsTable.id,
                fields: [["field", colorNameField.id]],
              },
              display: "table",
              database: WRITABLE_DB_ID,
            });
          },
        );
      },
    );

    queryWritableDB(
      `ALTER TABLE ${SCOREBOARD_TABLE} RENAME COLUMN team_name TO team_name_`,
    );

    queryWritableDB(`DROP TABLE ${COLORS_TABLE}`);

    resyncDatabase({
      dbId: WRITABLE_DB_ID,
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

    cy.findAllByRole("row")
      .contains("tr", "Native inactive table")
      .and("contain.text", "Table colors27745 is inactive");

    cy.findAllByRole("row")
      .contains("tr", "Native unknown table")
      .and("contain.text", "Table electric_bugaloo is unknown");

    cy.findAllByRole("row")
      .contains("tr", "Structured inactive table")
      .and("contain.text", "Table colors27745 is inactive");
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
