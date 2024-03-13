import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  resetTestTable,
  restore,
  resyncDatabase,
  startNewQuestion,
  popover,
  saveQuestion,
  visualize,
  openNotebook,
} from "e2e/support/helpers";

const dialect = "postgres";
const TEST_TABLE = "multi_schema";

const dbName = "Writable Postgres12";
const schemaName = "Wild";
const tableName = "Animals";

describe("issue 39807", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it(
    "should properly display a table from a multi-schema database (metabase#39807)",
    { tags: "@external" },
    () => {
      resetTestTable({ type: dialect, table: TEST_TABLE });
      restore(`${dialect}-writable`);

      cy.signInAsAdmin();

      resyncDatabase({
        dbId: WRITABLE_DB_ID,
      });

      startNewQuestion();
      popover().within(() => {
        cy.findByText("Raw Data").click();
        cy.findByText(dbName).click();
        cy.findByText(schemaName).click();
        cy.findByText(tableName).click();
      });
      visualize();
      saveQuestion("Beasts");

      openNotebook();
      cy.findByTestId("data-step-cell").should("contain", tableName).click();
      popover().within(() => {
        cy.findByTestId("source-database").should("have.text", dbName);
        cy.findByTestId("source-schema").should("have.text", schemaName);
      });
    },
  );
});
