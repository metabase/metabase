import { restore, queryWritableDB, resyncDatabase } from "e2e/support/helpers";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const FIXTURE_PATH = "../../e2e/support/assets";

const testFiles = [
  {
    fileName: "dog_breeds.csv",
    tableName: "dog_breeds",
    rowCount: 97,
  },
  {
    fileName: "star_wars_characters.csv",
    tableName: "star_wars_characters",
    rowCount: 87,
  },
];

describe("CSV Uploading", { tags: ["@external", "@actions"] }, () => {
  ["postgres"].forEach(dialect => {
    describe(`CSV Uploading (${dialect})`, () => {
      beforeEach(() => {
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();

        cy.request("POST", "/api/collection", {
          name: `Uploads Collection`,
          color: "#000000", // shockingly, this unused field is required
          parent_id: null,
        }).then(({ body: { id: collectionId } }) => {
          cy.wrap(collectionId).as("collectionId");
        });
        resyncDatabase({ dbId: WRITABLE_DB_ID });
        enableUploads();
      });

      testFiles.forEach(testFile => {
        it(`Can upload ${testFile.fileName} to a collection`, () => {
          cy.get("@collectionId").then(collectionId =>
            cy.visit(`/collection/${collectionId}`),
          );

          cy.fixture(`${FIXTURE_PATH}/${testFile.fileName}`).then(file => {
            cy.get("#upload-csv").selectFile(
              {
                contents: Cypress.Buffer.from(file),
                fileName: testFile.fileName,
                mimeType: "text/csv",
              },
              { force: true },
            );
          });

          cy.findByRole("status").within(() => {
            cy.findByText(/Uploading/i);
            cy.findByText(testFile.fileName);

            cy.findByText("Data added to Uploads Collection", {
              timeout: 10 * 1000,
            });
          });

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.get("main").within(() => cy.findByText("Uploads Collection"));

          cy.findByTestId("collection-table").within(() => {
            cy.findByText(testFile.tableName); // TODO: we should humanize model names
          });

          cy.findByRole("status").within(() => {
            cy.findByText("Start exploring").click();
          });

          cy.url().should("include", `/model/4`);
          cy.findByTestId("TableInteractive-root");

          const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE 'upload_${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

          queryWritableDB(tableQuery, dialect).then(result => {
            expect(result.rows.length).to.equal(1);
            const tableName = result.rows[0].table_name;
            queryWritableDB(`SELECT count(*) FROM ${tableName};`, dialect).then(
              result => {
                expect(Number(result.rows[0].count)).to.equal(
                  testFile.rowCount,
                );
              },
            );
          });
        });
      });
    });
  });
});

function enableUploads() {
  const settings = {
    "uploads-enabled": true,
    "uploads-database-id": WRITABLE_DB_ID,
    "uploads-schema-name": "public",
    "uploads-table-prefix": "upload_",
  };

  Object.entries(settings).forEach(([key, value]) => {
    cy.request("PUT", `/api/setting/${key}`, {
      value,
    });
  });
}
