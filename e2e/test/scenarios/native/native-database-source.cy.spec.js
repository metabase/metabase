import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import {
  restore,
  popover,
  addPostgresDatabase,
  POPOVER_ELEMENT,
  setTokenFeatures,
  openNativeEditor,
} from "e2e/support/helpers";

const PG_DB_ID = 2;
const mongoName = "QA Mongo";
const postgresName = "QA Postgres12";
const additionalPG = "New Database";
const ADDITIONAL_PG_DB_ID = 3;

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
      it("users should be able to choose the databases they can run native queries against", () => {
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
        cy.updatePermissionsGraph({
          [ALL_USERS_GROUP]: {
            [ADDITIONAL_PG_DB_ID]: {
              "view-data": "unrestricted",
              "create-queries": "query-builder-and-native",
            },
          },
        });

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

describe("scenatios > question > native > mysql", { tags: "@external" }, () => {
  const MYSQL_DB_NAME = "QA MySQL8";
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore("mysql-8");
    cy.signInAsAdmin();
  });

  it("can write a native MySQL query with a field filter", () => {
    // Write Native query that includes a filter
    openNativeEditor({ databaseName: MYSQL_DB_NAME }).type(
      "SELECT TOTAL, CATEGORY FROM ORDERS LEFT JOIN PRODUCTS ON ORDERS.PRODUCT_ID = PRODUCTS.ID [[WHERE PRODUCTS.ID = {{id}}]];",
      {
        parseSpecialCharSequences: false,
      },
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.wait("@dataset");

    cy.findByTestId("query-visualization-root").as("queryPreview");

    cy.get("@queryPreview").should("be.visible").contains("Widget");

    // Filter by Product ID = 1 (its category is Gizmo)
    cy.findByPlaceholderText(/Id/i).click().type("1");

    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.get("@queryPreview").contains("Widget").should("not.exist");

    cy.get("@queryPreview").contains("Gizmo");
  });

  it("can save a native MySQL query", () => {
    openNativeEditor({ databaseName: MYSQL_DB_NAME }).type(
      "SELECT * FROM ORDERS",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.wait("@dataset");
    cy.findByTextEnsureVisible("SUBTOTAL");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");

    // Save the query
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").click();

    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").focus().type("sql count");
      cy.findByText("Save").should("not.be.disabled").click();
    });

    cy.wait("@createQuestion");

    cy.findByTextEnsureVisible("Not now").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Save").should("not.exist");
    cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
  });
});

describe("scenarios > question > native > mongo", { tags: "@mongo" }, () => {
  const MONGO_DB_NAME = "QA Mongo";
  const MONGO_DB_ID = 2;
  before(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore("mongo-5");
    cy.signInAsAdmin();
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [MONGO_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder-and-native",
        },
      },
    });
    cy.signInAsNormalUser();

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // Reproduces metabase#20499 issue
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Native query").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(MONGO_DB_NAME).click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select a table").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
  });

  it("can save a native MongoDB query", () => {
    cy.get(".ace_content")
      .should("be.visible")
      .type('[ { $count: "Total" } ]', {
        parseSpecialCharSequences: false,
      });
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.wait("@dataset");

    cy.findByTextEnsureVisible("18,760");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByTextEnsureVisible("Save new question");

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByLabelText("Name").clear().should("be.empty").type("mongo count");

      cy.findByText("Save").should("not.be.disabled").click();
    });

    cy.wait("@createQuestion");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();

    cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
  });
});

function startNativeQuestion() {
  cy.visit("/");
  cy.findByTestId("app-bar").findByText("New").click();
  popover()
    .findByTextEnsureVisible(/(SQL|Native) query/)
    .click();
}

// It is extremely important to use the UI flow for these scenarios!
// Do not change this or replace it with `startNewNativeModel()`!
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
