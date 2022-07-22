import { restore, startNewQuestion, visualize } from "__support__/e2e/helpers";

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
      cy.findByText(dbName).click();
      cy.findByText("Orders").click();

      visualize();
      cy.contains("37.65");
    });
  });
});
