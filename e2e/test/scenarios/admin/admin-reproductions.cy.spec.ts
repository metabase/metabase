const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

describe("issue 26470", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    cy.request("POST", "/api/persist/enable");
  });

  it("Model Cache enable / disable toggle should reflect current state", () => {
    cy.intercept(`/api/persist/database/${WRITABLE_DB_ID}/persist`).as(
      "persist",
    );
    cy.intercept(`/api/persist/database/${WRITABLE_DB_ID}/unpersist`).as(
      "unpersist",
    );

    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);

    cy.findByTestId("database-model-persistence-section")
      .findByLabelText("Model persistence")
      .should("not.be.checked")
      .click({ force: true });
    cy.wait("@persist").its("response.statusCode").should("eq", 204);

    cy.findByTestId("database-model-persistence-section")
      .findByLabelText("Model persistence")
      .should("be.checked");

    cy.log("The enabled state is saved, not only shown");
    cy.reload();
    cy.findByTestId("database-model-persistence-section")
      .findByLabelText("Model persistence")
      .should("be.checked")
      .click({ force: true });
    cy.wait("@unpersist").its("response.statusCode").should("eq", 204);

    cy.findByTestId("database-model-persistence-section")
      .findByLabelText("Model persistence")
      .should("not.be.checked");

    cy.log("The disabled state is saved, not only shown");
    cy.reload();
    cy.findByTestId("database-model-persistence-section")
      .findByLabelText("Model persistence")
      .should("not.be.checked");
  });
});

describe("issue 41765", { tags: "@external" }, () => {
  // In this test we are testing the in-browser cache that metabase uses,
  // so we need to navigate by clicking trough the UI without reloading the page.

  const WRITABLE_DB_DISPLAY_NAME = "Writable Postgres12";

  const TEST_TABLE = "scoreboard_actions";
  const TEST_TABLE_DISPLAY_NAME = "Scoreboard Actions";

  const COLUMN_NAME = "another_column";
  const COLUMN_DISPLAY_NAME = "Another Column";

  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: TEST_TABLE });
    cy.signInAsAdmin();

    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TEST_TABLE,
    });
  });

  function openWritableDatabaseQuestion() {
    // start new question without navigating
    H.appBar().findByText("New").click();
    H.popover().findByText("Question").click();

    H.miniPicker().within(() => {
      cy.findByText(WRITABLE_DB_DISPLAY_NAME).click();
      cy.findByText(TEST_TABLE_DISPLAY_NAME).click();
    });
  }

  it("re-syncing a database should invalidate the table cache (metabase#41765)", () => {
    cy.visit("/");
    cy.findByTestId("loading-indicator").should("not.exist");

    openWritableDatabaseQuestion();

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText(COLUMN_DISPLAY_NAME).should("not.exist");

    H.goToAdmin();

    H.appBar().findByText("Databases").click();
    cy.findAllByRole("link").contains(WRITABLE_DB_DISPLAY_NAME).click();

    H.queryWritableDB(
      `ALTER TABLE ${TEST_TABLE} ADD ${COLUMN_NAME} text;`,
      "postgres",
    );

    cy.button("Sync database schema").click();
    H.waitForSyncToFinish({
      iteration: 0,
      dbId: WRITABLE_DB_ID,
      tableName: TEST_TABLE,
    });

    H.goToMainApp();
    openWritableDatabaseQuestion();

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText(COLUMN_DISPLAY_NAME).should("be.visible");
  });
});
