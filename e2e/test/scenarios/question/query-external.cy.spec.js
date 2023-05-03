import { restore, startNewQuestion, visualize } from "e2e/support/helpers";

const supportedDatabases = [
  {
    database: "Mongo",
    snapshotName: "mongo-4",
    dbName: "QA Mongo4",
  },
  {
    database: "MySQL",
    snapshotName: "mysql-8",
    dbName: "QA MySQL8",
  },
];

supportedDatabases.forEach(({ database, snapshotName, dbName }) => {
  describe("scenarios > question > query > external", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");

      restore(snapshotName);
      cy.signInAsAdmin();
    });

    it(`can query ${database} database`, () => {
      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(dbName).click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").click();

      visualize();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("37.65");
    });
  });
});
