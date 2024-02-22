import { restore, popover, addPostgresDatabase } from "e2e/support/helpers";

describe(
  "scenarios > question > native > database source",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();
    });

    it("smoketest: persisting last used database should work, and it should be user-specific setting", () => {
      startNativeQuestion();
      assertNoDatabaseSelected();

      selectDatabase("QA Postgres12");

      startNativeQuestion();
      assertSelectedDatabase("QA Postgres12");

      cy.signOut();
      cy.signInAsNormalUser();

      startNativeQuestion();
      assertNoDatabaseSelected();

      selectDatabase("Sample Database");

      startNativeQuestion();
      assertSelectedDatabase("Sample Database");

      cy.signOut();
      cy.signInAsAdmin();

      startNativeQuestion();
      assertSelectedDatabase("Sample Database");
    });

    it("deleting previously persisted database should result in the new database selection prompt", () => {
      const additionalPG = "New Dataabse";

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
  },
);

function startNativeQuestion() {
  cy.visit("/");
  cy.findByTestId("app-bar").findByText("New").click();
  popover().findByTextEnsureVisible("SQL query").click();
}

function startNativeModel() {
  cy.visit("/model/new");
  cy.findByRole("heading", { name: "Use a native query" }).click();
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
