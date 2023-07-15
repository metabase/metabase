import {
  restore,
  queryWritableDB,
  popover,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  enableTracking,
} from "e2e/support/helpers";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const FIXTURE_PATH = "../../e2e/support/assets";

const validTestFiles = [
  {
    fileName: "dog_breeds.csv",
    tableName: "dog_breeds",
    humanName: "Dog Breeds",
    rowCount: 97,
  },
  {
    fileName: "star_wars_characters.csv",
    tableName: "star_wars_characters",
    humanName: "Star Wars Characters",
    rowCount: 87,
  },
];

const invalidTestFiles = [
  {
    fileName: "invalid.csv",
  },
];

describeWithSnowplow(
  "CSV Uploading",
  { tags: ["@external", "@actions"] },
  () => {
    it("Can upload a CSV file to an empty postgres schema", () => {
      const testFile = validTestFiles[0];
      const EMPTY_SCHEMA_NAME = "empty_uploads";

      cy.intercept("PUT", "/api/setting").as("saveSettings");

      restore("postgres-writable");
      cy.signInAsAdmin();

      queryWritableDB(
        "DROP SCHEMA IF EXISTS empty_uploads CASCADE;",
        "postgres",
      );
      queryWritableDB("CREATE SCHEMA IF NOT EXISTS empty_uploads;", "postgres");

      cy.request("POST", "/api/collection", {
        name: `Uploads Collection`,
        color: "#000000", // shockingly, this unused field is required
        parent_id: null,
      }).then(({ body: { id: collectionId } }) => {
        cy.wrap(collectionId).as("collectionId");
      });
      cy.visit("/admin/settings/uploads");

      cy.findByLabelText("Upload Settings Form")
        .findByText("Select a database")
        .click();
      popover().findByText("Writable Postgres12").click();
      cy.findByLabelText("Upload Settings Form")
        .findByText("Select a schema")
        .click();

      popover().findByText(EMPTY_SCHEMA_NAME).click();

      cy.findByLabelText("Upload Settings Form")
        .button("Enable uploads")
        .click();

      cy.wait("@saveSettings");

      uploadFile(testFile, "postgres");

      const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

      queryWritableDB(tableQuery, "postgres").then(result => {
        expect(result.rows.length).to.equal(1);
        const tableName = result.rows[0].table_name;
        queryWritableDB(
          `SELECT count(*) FROM ${EMPTY_SCHEMA_NAME}.${tableName};`,
          "postgres",
        ).then(result => {
          expect(Number(result.rows[0].count)).to.equal(testFile.rowCount);
        });
      });
    });

    ["postgres"].forEach(dialect => {
      describe(`CSV Uploading (${dialect})`, () => {
        beforeEach(() => {
          restore(`${dialect}-writable`);
          resetSnowplow();
          cy.signInAsAdmin();
          enableTracking();

          cy.request("POST", "/api/collection", {
            name: `Uploads Collection`,
            color: "#000000", // shockingly, this unused field is required
            parent_id: null,
          }).then(({ body: { id: collectionId } }) => {
            cy.wrap(collectionId).as("collectionId");
          });
          enableUploads(dialect);
        });

        afterEach(() => {
          expectNoBadSnowplowEvents();
        });

        validTestFiles.forEach(testFile => {
          it(`Can upload ${testFile.fileName} to a collection`, () => {
            uploadFile(testFile);

            expectGoodSnowplowEvent({
              event: "csv_upload_successful",
            });

            const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

            queryWritableDB(tableQuery, dialect).then(result => {
              expect(result.rows.length).to.equal(1);
              const tableName = result.rows[0].table_name;
              queryWritableDB(
                `SELECT count(*) FROM ${tableName};`,
                dialect,
              ).then(result => {
                expect(Number(result.rows[0].count)).to.equal(
                  testFile.rowCount,
                );
              });
            });
          });
        });

        invalidTestFiles.forEach(testFile => {
          it(`Cannot upload ${testFile.fileName} to a collection`, () => {
            uploadFile(testFile, false);

            expectGoodSnowplowEvent({
              event: "csv_upload_failed",
            });

            const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

            queryWritableDB(tableQuery, dialect).then(result => {
              expect(result.rows.length).to.equal(0);
            });
          });
        });
      });
    });
  },
);

function uploadFile(testFile, valid = true) {
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
  });

  if (valid) {
    cy.findByRole("status").within(() => {
      cy.findByText("Data added to Uploads Collection", {
        timeout: 10 * 1000,
      });
    });

    cy.get("main").within(() => cy.findByText("Uploads Collection"));

    cy.findByTestId("collection-table").within(() => {
      cy.findByText(testFile.humanName);
    });

    cy.findByRole("status").within(() => {
      cy.findByText("Start exploring").click();
    });

    cy.url().should("include", `/model/4`);
    cy.findByTestId("TableInteractive-root");
  } else {
    cy.findByRole("status").within(() => {
      cy.findByText("Error uploading your File");
    });
  }
}

function enableUploads(dialect) {
  const settings = {
    "uploads-enabled": true,
    "uploads-database-id": WRITABLE_DB_ID,
    "uploads-schema-name": dialect === "postgres" ? "public" : null,
    "uploads-table-prefix": dialect === "mysql" ? "upload_" : null,
  };

  cy.request("PUT", `/api/setting`, settings);
}
