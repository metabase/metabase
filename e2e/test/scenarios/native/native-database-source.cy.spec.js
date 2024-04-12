import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import {
  restore,
  popover,
  addPostgresDatabase,
  POPOVER_ELEMENT,
  setTokenFeatures,
} from "e2e/support/helpers";

const PG_DB_ID = 2;
const mongoName = "QA Mongo";
const postgresName = "QA Postgres12";
const additionalPG = "New Database";

const { ALL_USERS_GROUP, DATA_GROUP } = USER_GROUPS;

describe(
  "scenarios > question > native > database source",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/setting/last-used-native-database-id").as(
        "persistDatabase",
      );

      restore("postgres-12");
      cy.signInAsAdmin();
      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP]: {
          [PG_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": "query-builder-and-native",
          },
        },
      });
    });

    it("smoketest: persisting last used database should work, and it should be user-specific setting", () => {
      const adminPersistedDatabase = postgresName;
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

      selectDatabase(postgresName);

      startNativeQuestion();
      assertSelectedDatabase(postgresName).click();
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
      cy.request("PUT", "/api/setting/last-used-native-database-id", {
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
      selectDatabase(postgresName);
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
          .should("have.text", postgresName)
          .click();

        cy.get(POPOVER_ELEMENT).should("not.exist");

        cy.signOut();
        cy.signInAsAdmin();

        addPostgresDatabase(additionalPG);

        cy.signIn("nodata");
        startNativeQuestion();

        cy.findByTestId("selected-database")
          .should("have.text", postgresName)
          .click();

        popover()
          .should("contain", postgresName)
          .and("contain", "New Database");
      });
    });

    it("users with no native write permissions should be able to choose only the databases they can query against (metabase#39053)", () => {
      cy.signIn("nosql");

      startNativeQuestion();
      cy.wait("@persistDatabase");
      cy.findByTestId("selected-database")
        .should("have.text", postgresName)
        .click();

      cy.get(POPOVER_ELEMENT).should("not.exist");
    });

    it("users that lose permissions to the last used database should not have that database preselected anymore", () => {
      cy.signInAsNormalUser();
      startNativeQuestion();
      selectDatabase("Sample Database");

      cy.signOut();
      cy.signInAsAdmin();
      setTokenFeatures("all");
      cy.updatePermissionsGraph({
        [DATA_GROUP]: {
          [SAMPLE_DB_ID]: {
            "view-data": "blocked",
            "create-queries": "no",
          },
        },
      });

      cy.signOut();
      cy.signInAsNormalUser();
      startNativeQuestion();
      // Postgres will be automatically selected because it's the only dataabse this user can query
      assertSelectedDatabase(postgresName);
    });
  },
);

describe("mongo as the default database", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-5");
    cy.signInAsAdmin();
  });

  it("should persist Mongo database, but not its selected table", () => {
    startNativeQuestion();
    assertNoDatabaseSelected();

    selectDatabase(mongoName);
    cy.findByTestId("native-query-top-bar")
      .findByText("Select a table")
      .click();
    popover().findByText("Reviews").click();
    cy.findByTestId("native-query-top-bar").should(
      "not.contain",
      "Select a table",
    );

    startNativeQuestion();

    assertSelectedDatabase(mongoName);
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
