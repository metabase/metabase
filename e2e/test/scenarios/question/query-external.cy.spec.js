const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const supportedDatabases = [
  {
    database: "Mongo",
    snapshotName: "mongo-5",
    dbName: "QA Mongo",
  },
  {
    database: "MySQL",
    snapshotName: "mysql-8",
    dbName: "QA MySQL8",
  },
];

supportedDatabases.forEach(({ database, snapshotName, dbName }) => {
  describe(
    "scenarios > question > query > external",
    { tags: "@external" },
    () => {
      beforeEach(() => {
        cy.intercept("POST", "/api/dataset").as("dataset");

        H.restore(snapshotName);
        cy.signInAsAdmin();

        cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).as("schema");
      });

      it(`can query ${database} database`, () => {
        cy.get("@schema").then(({ body }) => {
          const tabelId = body.find(
            (table) => table.name.toLowerCase() === "orders",
          ).id;
          H.openTable({
            database: WRITABLE_DB_ID,
            table: tabelId,
            mode: "notebook",
          });
        });

        H.visualize();
        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.contains("37.65");
      });
    },
  );
});
