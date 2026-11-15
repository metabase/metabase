const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";

const PG_DB_ID = 2;
const postgresName = "QA Postgres12";
const additionalPG = "New Database";

const { ALL_USERS_GROUP, DATA_GROUP } = USER_GROUPS;

describe(
  "scenarios > question > native > database source",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-12");
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

      cy.log(
        "deleting previously persisted database should result in the new database selection prompt",
      );
      H.addPostgresDatabase(additionalPG);

      startNativeQuestion();
      assertSelectedDatabase(adminPersistedDatabase).click();
      selectDatabase(additionalPG);

      cy.log("Delete previously persisted database.");
      cy.get("@postgresID").then((databaseId) => {
        cy.request("DELETE", `/api/database/${databaseId}`);
      });

      startNativeQuestion();
      assertNoDatabaseSelected();

      cy.log(
        "users that lose permissions to the last used database should not have that database preselected anymore",
      );
      H.activateToken("pro-self-hosted");
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

describe("scenarios > question > native > mysql", { tags: "@external" }, () => {
  const MYSQL_DB_NAME = "QA MySQL8";

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore("mysql-8");
    cy.signInAsAdmin();
  });

  it("can write and save a native MySQL query with a field filter", () => {
    // Write Native query that includes a filter
    H.startNewNativeQuestion();

    cy.findByTestId("gui-builder-data").click();
    cy.findByLabelText(MYSQL_DB_NAME).click();

    H.NativeEditor.type(
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
    cy.wait("@dataset");

    H.assertQueryBuilderRowCount(93);
    cy.get("@queryPreview")
      .should("contain", "Gizmo")
      .and("not.contain", "Widget");

    cy.log("can save a native MySQL query");
    H.NativeEditor.clear();
    H.NativeEditor.type("SELECT * FROM ORDERS");
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.wait("@dataset");
    cy.findByTextEnsureVisible("SUBTOTAL");

    cy.get("@queryPreview").should("contain", "37.65");

    // Save the query
    H.saveQuestion("sql count");
    cy.url().should("match", /\/dashboard\/\d+-[a-z0-9-]*$/);
  });
});

describe("scenarios > question > native > mongo", { tags: "@mongo" }, () => {
  const MONGO_DB_NAME = "QA Mongo";
  const MONGO_DB_ID = 2;
  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore("mongo-5");
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
    cy.findByTestId("app-bar").findByLabelText("New").click();
    // Reproduces metabase#20499 issue
    H.popover().findByText("Native query").click();
    assertNoDatabaseSelected();
    H.popover().findByText(MONGO_DB_NAME).click();
    cy.log("Ensure the database was selected");
    cy.findAllByTestId("gui-builder-data")
      .first()
      .should("contain", MONGO_DB_NAME);

    cy.findAllByTestId("gui-builder-data")
      .should("have.length", 2)
      .last()
      .findByText("Select a table")
      .click();
    H.popover().findByText("Orders").click();
    cy.findByTestId("native-query-top-bar").should(
      "not.contain",
      "Select a table",
    );
  });

  it("can save a native MongoDB query and persist its database, but not its table", () => {
    H.NativeEditor.focus().type('[ { $count: "Total" } ]', {
      parseSpecialCharSequences: false,
    });
    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait("@dataset");

    cy.findByTextEnsureVisible("18,760");

    H.saveQuestion("mongo count");
    cy.wait("@createQuestion");

    cy.location("pathname").should("match", /\/question\/\d+-[a-z0-9-]*$/);

    cy.log("should persist Mongo database, but not its selected table");
    startNativeQuestion();
    assertSelectedDatabase(MONGO_DB_NAME);
    cy.findByTestId("native-query-top-bar").should("contain", "Select a table");
  });
});

function startNativeQuestion() {
  cy.visit("/");
  cy.findByTestId("app-bar").findByText("New").click();
  H.popover()
    .findByTextEnsureVisible(/(SQL|Native) query/)
    .click();
}

function assertNoDatabaseSelected() {
  cy.findByTestId("selected-database").should("not.exist");
  cy.findByTestId("native-query-top-bar").should(
    "contain",
    "Select a database",
  );
}

function selectDatabase(database) {
  // The database picker popover opens automatically. As `GET /api/database`
  // resolves, its `onQueryStarted` hook re-writes the shared metadata, which hands
  // the selector a fresh `databases` array reference and re-mounts the AccordionList
  // rows. A plain `.click()` (even behind `.should("be.visible")`) then enters
  // Cypress's actionability wait, during which the target row detaches
  // ("elements ... disappeared from the page"). Clicking with `{ force: true }`
  // skips that wait and fires on the row the moment it is found + visible, closing
  // the window in which the re-mount can detach it.
  H.popover().findByText(database).should("be.visible").click({ force: true });
  cy.findByTestId("selected-database").should("have.text", database);
}

function assertSelectedDatabase(name) {
  cy.findByTestId("native-query-top-bar").should(
    "not.contain",
    "Select a database",
  );

  return cy.findByTestId("selected-database").should("have.text", name);
}
