import { WRITABLE_DB_ID, SAMPLE_DB_ID } from "e2e/support/cypress_data";
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

describe("issue 26470", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres_12");
    cy.signInAsAdmin();
    cy.request("POST", "/api/persist/enable");
  });

  it("Model Cache enable / disable button should update button text", () => {
    cy.clock(Date.now());
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.button("Turn model persistence on").click();
    cy.button(/Done/).should("exist");
    cy.tick(6000);
    cy.button("Turn model persistence off").should("exist");
  });
});

describe("issue 33035", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("GET", "/api/user/current").then(({ body: { id: user_id } }) => {
      cy.request("PUT", `/api/user/${user_id}`, { locale: "de" });
    });
  });

  it("databases page should work in a non-default locale (metabase#33035)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    cy.findByRole("main").findByText("Orders").should("be.visible");
  });
});

describe("issue 21532", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow navigating back from admin settings (metabase#21532)", () => {
    cy.visit("/");

    cy.icon("gear").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Getting set up");

    cy.go("back");
    cy.location().should(location => {
      expect(location.pathname).to.eq("/");
    });
  });
});

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

    // It's ok to navigate here since we are not testing the cache at this point
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);

    cy.button("Sync database schema now").click();

    exitAdmin();
    openWritableDatabaseQuestion();

    getNotebookStep("data").button("Pick columns").click();
    popover().findByText(COLUMN_DISPLAY_NAME).should("be.visible");
  });
});
