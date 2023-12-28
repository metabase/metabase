import {
  restore,
  queryWritableDB,
  popover,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  enableTracking,
  setTokenFeatures,
} from "e2e/support/helpers";

import { WRITABLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";

const { NOSQL_GROUP, ALL_USERS_GROUP } = USER_GROUPS;

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

describe("permissions", () => {
  it("should not snow you upload buttons if you are a sandboxed user", () => {
    restore("postgres-12");
    cy.signInAsAdmin();

    setTokenFeatures("all");
    enableUploads("postgres");

    //Deny access for all users to wriable DB
    cy.updatePermissionsGraph({
      1: {
        [WRITABLE_DB_ID]: {
          data: {
            schemas: "block",
          },
        },
      },
    });

    cy.request("GET", `/api/database/${WRITABLE_DB_ID}/schema/public`).then(
      ({ body: tables }) => {
        cy.request("GET", `/api/database/${WRITABLE_DB_ID}/fields`).then(
          ({ body: fields }) => {
            // Sandbox a table so that the sandboxed user will have read access to a table
            cy.sandboxTable({
              table_id: tables[0].id,
              attribute_remappings: {
                attr_uid: ["dimension", ["field", fields[0].id, null]],
              },
            });
          },
        );
      },
    );

    cy.signInAsSandboxedUser();
    cy.visit("/collection/root");
    // No upload icon should appear for the sandboxed user
    cy.findByTestId("collection-menu").within(() => {
      cy.get(".Icon-calendar").should("exist");
      cy.findByLabelText("Upload data").should("not.exist");
    });
  });

  it(
    "should show you upload buttons if you have unrestricted access to the upload schema",
    { tags: ["@external"] },
    () => {
      restore("postgres-12");
      cy.signInAsAdmin();

      setTokenFeatures("all");
      enableUploads("postgres");

      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP]: {
          [WRITABLE_DB_ID]: {
            data: {
              schemas: "block",
            },
          },
        },
        [NOSQL_GROUP]: {
          [WRITABLE_DB_ID]: {
            data: {
              schemas: "all",
            },
          },
        },
      });

      cy.updateCollectionGraph({
        [NOSQL_GROUP]: { root: "write" },
      });

      cy.signIn("nosql");
      cy.visit("/collection/root");
      cy.findByTestId("collection-menu").within(() => {
        cy.findByLabelText("Upload data").should("exist");
        cy.findByRole("img", { name: /upload/i }).should("exist");
      });
    },
  );
});

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

  if (valid) {
    // After #35498 has been merged, we now sometimes encounter two elements with the "status" role in UI.
    // The first (older) one is related to the sync that didn't finish, and the second one is related to CSV upload.
    // This is the reason we have to start using `findAllByRole` rather than `findByRole`.
    // Since CSV status element is newer, we can and must use `.last()` to yield only one element within we perform the search.
    cy.findAllByRole("status")
      .last()
      .should("contain", "Uploading data to")
      .and("contain", testFile.fileName);
    cy.findAllByRole("status")
      .last()
      .findByText("Data added to Uploads Collection", {
        timeout: 10 * 1000,
      });

    cy.get("main").within(() => cy.findByText("Uploads Collection"));

    cy.findByTestId("collection-table").within(() => {
      cy.findByText(testFile.humanName);
    });

    cy.findAllByRole("status").last().findByText("Start exploring").click();

    cy.url().should("include", `/model/`);
    cy.findByTestId("TableInteractive-root");
  } else {
    cy.findAllByRole("status").last().findByText("Error uploading your File");
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
