import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  appBar,
  entityPickerModal,
  getNotebookStep,
  popover,
  queryWritableDB,
  resetTestTable,
  restore,
  resyncDatabase,
} from "e2e/support/helpers";

describe("issue 41765", { tags: ["@external"] }, () => {
  // In this test we are testing the in-browser cache that metabase uses,
  // so we need to navigate by clicking trough the UI without reloading the page.

  const WRITABLE_DB_DISPLAY_NAME = "Writable Postgres12";

  const TEST_TABLE = "scoreboard_actions";
  const TEST_TABLE_DISPLAY_NAME = "Scoreboard Actions";

  const COLUMN_NAME = "another_column";
  const COLUMN_DISPLAY_NAME = "Another Column";

  beforeEach(() => {
    resetTestTable({ type: "postgres", table: TEST_TABLE });
    restore("postgres-writable");
    cy.signInAsAdmin();

    resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TEST_TABLE,
    });
  });

  function enterAdmin() {
    appBar().icon("gear").click();
    popover().findByText("Admin settings").click();
  }

  function exitAdmin() {
    appBar().findByText("Exit admin").click();
  }

  function openWritableDatabaseQuestion() {
    // start new question without navigating
    appBar().findByText("New").click();
    popover().findByText("Question").click();

    entityPickerModal().within(() => {
      cy.findByText("Tables").click();
      cy.findByText(WRITABLE_DB_DISPLAY_NAME).click();
      cy.findByText(TEST_TABLE_DISPLAY_NAME).click();
    });
  }

  it("re-syncing a database should invalidate the table cache (metabase#41765)", () => {
    cy.visit("/");

    queryWritableDB(
      `ALTER TABLE ${TEST_TABLE} ADD ${COLUMN_NAME} text;`,
      "postgres",
    );

    openWritableDatabaseQuestion();

    getNotebookStep("data").button("Pick columns").click();
    popover().findByText(COLUMN_DISPLAY_NAME).should("not.exist");

    enterAdmin();

    appBar().findByText("Databases").click();
    cy.findAllByRole("link").contains(WRITABLE_DB_DISPLAY_NAME).click();
    cy.button("Sync database schema now").click();

    exitAdmin();
    openWritableDatabaseQuestion();

    getNotebookStep("data").button("Pick columns").click();
    popover().findByText(COLUMN_DISPLAY_NAME).should("be.visible");
  });
});
