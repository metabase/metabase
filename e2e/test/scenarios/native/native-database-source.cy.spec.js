import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  popover,
  addPostgresDatabase,
  POPOVER_ELEMENT,
} from "e2e/support/helpers";

const PG_DB_ID = 2;

describe(
  "scenarios > question > native > database source",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/setting/last-used-database-id").as(
        "persistDatabase",
      );

      restore("postgres-12");
      cy.signInAsAdmin();
    });

    it("smoketest: persisting last used database should work, and it should be user-specific setting", () => {
      const adminPersistedDatabase = "QA Postgres12";
      const userPersistedDatabase = "Sample Database";

      startNativeQuestion();
      assertNoDatabaseSelected();

      selectDatabase(adminPersistedDatabase);

      startNativeQuestion();
      assertSelectedDatabase(adminPersistedDatabase);

      cy.signOut();
      cy.signInAsNormalUser();

      startNativeQuestion();
      assertNoDatabaseSelected();

      selectDatabase(userPersistedDatabase);

      startNativeQuestion();
      assertSelectedDatabase(userPersistedDatabase);

      cy.signOut();
      cy.signInAsAdmin();

      startNativeQuestion();
      assertSelectedDatabase(adminPersistedDatabase);
    });

    it("deleting previously persisted database should result in the new database selection prompt", () => {
      const additionalPG = "New Database";

      addPostgresDatabase(additionalPG);

      startNativeQuestion();
      assertNoDatabaseSelected();

      selectDatabase(additionalPG);

      cy.log("Delete previously persisted database.");
      cy.get("@postgresID").then(databaseId => {
        cy.request("DELETE", `/api/database/${databaseId}`);
      });

      startNativeQuestion();
      assertNoDatabaseSelected();
    });

    it("persisting a database source should work between native models and questions intechangeably", () => {
      startNativeModel();
      assertNoDatabaseSelected();

      selectDatabase("QA Postgres12");

      startNativeQuestion();
      assertSelectedDatabase("QA Postgres12").click();
      selectDatabase("Sample Database");

      startNativeModel();

      cy.findByTestId("native-query-top-bar").should(
        "not.contain",
        "Select a database",
      );
      cy.findByTestId("selected-database").should(
        "have.text",
        "Sample Database",
      );
    });

    it("should not update the setting when the same database is selected again", () => {
      cy.request("PUT", "/api/setting/last-used-database-id", {
        value: SAMPLE_DB_ID,
      });

      startNativeQuestion();
      cy.findByTestId("selected-database")
        .should("have.text", "Sample Database")
        .click();

      cy.log("Pick the same database again");
      selectDatabase("Sample Database");
      cy.get("@persistDatabase").should("be.null");
    });

    it("selecting a database in native editor for model actions should not persist the database", () => {
      [SAMPLE_DB_ID, PG_DB_ID].forEach(enableModelActionsForDatabase);

      startNewAction();
      assertNoDatabaseSelected();

      selectDatabase("Sample Database");
      cy.get("@persistDatabase").should("be.null");

      startNativeModel();
      assertNoDatabaseSelected();
      cy.log(
        "Persisting a database for a native model should not affect actions",
      );
      selectDatabase("QA Postgres12");
      cy.wait("@persistDatabase");

      startNewAction();
      assertNoDatabaseSelected();
    });

    describe("permissions", () => {
      it("users with 'No self-service' data permissions should be able to choose only the databases they can query against", () => {
        cy.signIn("nodata");

        startNativeQuestion();
        cy.wait("@persistDatabase");
        cy.findByTestId("selected-database")
          .should("have.text", "QA Postgres12")
          .click();

        cy.get(POPOVER_ELEMENT).should("not.exist");

        cy.signOut();
        cy.signInAsAdmin();
        const additionalPG = "New Database";

        addPostgresDatabase(additionalPG);

        cy.signIn("nodata");
        startNativeQuestion();

        cy.findByTestId("selected-database")
          .should("have.text", "QA Postgres12")
          .click();

        popover()
          .should("contain", "QA Postgres12")
          .and("contain", "New Database");
      });
    });

    it.skip("users with no native write permissions should be able to choose only the databases they can query against (metabase#39053)", () => {
      cy.signIn("nosql");

      startNativeQuestion();
      cy.wait("@persistDatabase");
      cy.findByTestId("selected-database")
        .should("have.text", "QA Postgres12")
        .click();

      cy.get(POPOVER_ELEMENT).should("not.exist");
    });
  },
);

describe("mongo as the default database", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-5");
    cy.signInAsAdmin();
  });

  const MONGO_DB_NAME = "QA Mongo";

  it("should persist Mongo database, but not its selected table", () => {
    startNativeQuestion();
    assertNoDatabaseSelected();

    selectDatabase(MONGO_DB_NAME);
    cy.findByTestId("native-query-top-bar")
      .findByText("Select a table")
      .click();
    popover().findByText("Reviews").click();
    cy.findByTestId("native-query-top-bar").should(
      "not.contain",
      "Select a table",
    );

    startNativeQuestion();

    assertSelectedDatabase(MONGO_DB_NAME);
    cy.findByTestId("native-query-top-bar").should("contain", "Select a table");
  });
});

function startNativeQuestion() {
  cy.visit("/");
  cy.findByTestId("app-bar").findByText("New").click();
  popover()
    .findByTextEnsureVisible(/(SQL|Native) query/)
    .click();
}

function startNativeModel() {
  cy.visit("/model/new");
  cy.findByRole("heading", { name: "Use a native query" }).click();
}

function startNewAction() {
  cy.visit("/");
  cy.findByTestId("app-bar").findByText("New").click();
  popover().findByTextEnsureVisible("Action").click();
}

function assertNoDatabaseSelected() {
  cy.findByTestId("selected-database").should("not.exist");
  cy.findByTestId("native-query-top-bar").should(
    "contain",
    "Select a database",
  );
}

function selectDatabase(database) {
  popover().findByText(database).click();
  cy.findByTestId("selected-database").should("have.text", database);
}

function assertSelectedDatabase(name) {
  cy.findByTestId("native-query-top-bar").should(
    "not.contain",
    "Select a database",
  );

  return cy.findByTestId("selected-database").should("have.text", name);
}

function enableModelActionsForDatabase(id) {
  cy.request("PUT", `/api/database/${id}`, {
    settings: { "database-enable-actions": true },
  });
}
