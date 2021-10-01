import { restore } from "__support__/e2e/cypress";

const supportedDatabases = [
  {
    Mongo: {
      snapshotName: "mongo-4",
      dbName: "QA Mongo4",
    },
  },
  {
    MySQl: {
      snapshotName: "mysql-8",
      dbNAme: "QA MySQL8",
    },
  },
];

supportedDatabases.forEach(db => {
  const { snapshotName, dbName } = db;
  describe("scenarios > question > query > external", () => {
    before(() => {
      restore(snapshotName);
      cy.signInAsAdmin();
    });

    it(`can query ${db} database`, () => {
      cy.visit("/question/new");
      cy.findByText("Simple question").click();
      cy.findByText(dbName).click();
      cy.findByText("Orders").click();

      cy.contains("37.65");
    });
  });
});
