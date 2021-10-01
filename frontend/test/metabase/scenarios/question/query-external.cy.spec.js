import { restore } from "__support__/e2e/cypress";

const supportedDatabases = [
  {
    database: "Mongo",
    snapshotName: "mongo-4",
    dbName: "QA Mongo4",
  },
  {
    database: "MySQL",
    snapshotName: "mysql-8",
    dbNAme: "QA MySQL8",
  },
];

supportedDatabases.forEach(({ database, snapshotName, dbName }) => {
  describe("scenarios > question > query > external", () => {
    beforeEach(() => {
      restore(snapshotName);
      cy.signInAsAdmin();
    });

    it(`can query ${database} database`, () => {
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText(dbName).click();
      cy.findByText("Orders").click();

      cy.contains("37.65");
    });
  });
});
