import { H } from "e2e/support";
import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { NOSQL_GROUP, ALL_USERS_GROUP } = USER_GROUPS;

H.describeWithSnowplow(
  "CSV Uploading",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.intercept("POST", "/api/table/*/append-csv").as("appendCSV");
      cy.intercept("POST", "/api/table/*/replace-csv").as("replaceCSV");
    });

    it("Can upload a CSV file to an empty postgres schema", () => {
      const testFile = H.VALID_CSV_FILES[0];
      const EMPTY_SCHEMA_NAME = "empty_uploads";

      cy.intercept("PUT", "/api/setting").as("saveSettings");
      cy.intercept("GET", "/api/database").as("databaseList");

      H.restore("postgres-writable");
      cy.signInAsAdmin();

      H.queryWritableDB(
        "DROP SCHEMA IF EXISTS empty_uploads CASCADE;",
        "postgres",
      );
      H.queryWritableDB(
        "CREATE SCHEMA IF NOT EXISTS empty_uploads;",
        "postgres",
      );

      cy.request("POST", "/api/collection", {
        name: "Uploads Collection",
        parent_id: null,
      }).then(({ body: { id: collectionId } }) => {
        cy.wrap(collectionId).as("collectionId");
      });
      cy.visit("/admin/settings/uploads");

      cy.findByLabelText("Upload Settings Form")
        .findByText("Select a database")
        .click();
      H.popover().findByText("Writable Postgres12").click();
      cy.findByLabelText("Upload Settings Form")
        .findByText("Select a schema")
        .click();

      H.popover().findByText(EMPTY_SCHEMA_NAME).click();

      cy.findByLabelText("Upload Settings Form")
        .button("Enable uploads")
        .click();

      cy.wait(["@saveSettings", "@databaseList"]);

      uploadFileToCollection(testFile);

      const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

      H.queryWritableDB(tableQuery, "postgres").then(result => {
        expect(result.rows.length).to.equal(1);
        const tableName = result.rows[0].table_name;
        H.queryWritableDB(
          `SELECT count(*) FROM ${EMPTY_SCHEMA_NAME}.${tableName};`,
          "postgres",
        ).then(result => {
          expect(Number(result.rows[0].count)).to.equal(testFile.rowCount);
        });
      });

      cy.log(
        "Ensure that table is visible in admin without refreshing (metabase#38041)",
      );

      cy.findByTestId("app-bar").button(/gear/).click();
      H.popover().findByText("Admin settings").click();

      cy.findByRole("link", { name: "Table Metadata" }).click();

      cy.findByTestId("admin-metadata-header")
        .findByText("Sample Database")
        .click();
      H.popover().findByText("Writable Postgres12").click();

      cy.findByTestId("admin-metadata-table-list").within(() => {
        cy.findByText("1 Queryable Table").should("exist");
        cy.findByText("Dog Breeds").should("exist");
      });
    });

    ["postgres", "mysql"].forEach(dialect => {
      describe(`CSV Uploading (${dialect})`, () => {
        beforeEach(() => {
          H.restore(`${dialect}-writable`);
          H.resetSnowplow();
          cy.signInAsAdmin();
          H.enableTracking();

          cy.request("POST", "/api/collection", {
            name: "Uploads Collection",
            parent_id: null,
          }).then(({ body: { id: collectionId } }) => {
            cy.wrap(collectionId).as("collectionId");
          });
          H.enableUploads(dialect);
        });

        afterEach(() => {
          H.expectNoBadSnowplowEvents();
        });

        H.VALID_CSV_FILES.forEach(testFile => {
          it(`Can upload ${testFile.fileName} to a collection`, () => {
            uploadFileToCollection(testFile);

            H.expectGoodSnowplowEvent({
              event: "csv_upload_successful",
            });

            const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

            H.queryWritableDB(tableQuery, dialect).then(result => {
              expect(result.rows.length).to.equal(1);
              const tableName =
                result.rows[0].table_name ?? result.rows[0].TABLE_NAME;
              H.queryWritableDB(
                `SELECT count(*) as count FROM ${tableName};`,
                dialect,
              ).then(result => {
                expect(Number(result.rows[0].count)).to.equal(
                  testFile.rowCount,
                );
              });
            });
          });
        });

        H.INVALID_CSV_FILES.forEach(testFile => {
          it(`Cannot upload ${testFile.fileName} to a collection`, () => {
            uploadFileToCollection(testFile);

            H.expectGoodSnowplowEvent({
              event: "csv_upload_failed",
            });

            const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

            H.queryWritableDB(tableQuery, dialect).then(result => {
              expect(result.rows.length).to.equal(0);
            });
          });
        });

        describe("CSV appends", () => {
          it("Can append a CSV file to an existing table", () => {
            uploadFileToCollection(H.VALID_CSV_FILES[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: H.VALID_CSV_FILES[0],
              uploadMode: "append",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount * 2} rows`,
            );
          });

          it("Cannot append a CSV file to a table with a different schema", () => {
            uploadFileToCollection(H.VALID_CSV_FILES[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: H.VALID_CSV_FILES[1],
              identicalSchema: false,
              uploadMode: "append",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount} rows`,
            );
          });
        });

        describe("CSV replacement", () => {
          it("Can replace data in an existing table", () => {
            uploadFileToCollection(H.VALID_CSV_FILES[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: H.VALID_CSV_FILES[0],
              uploadMode: "replace",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount} rows`,
            );
          });

          it("Cannot data in a table with a different schema", () => {
            uploadFileToCollection(H.VALID_CSV_FILES[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: H.VALID_CSV_FILES[1],
              identicalSchema: false,
              uploadMode: "replace",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${H.VALID_CSV_FILES[0].rowCount} rows`,
            );
          });
        });
      });
    });
  },
);

describe("permissions", () => {
  it("should not show you upload buttons if you are a sandboxed user", () => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.setTokenFeatures("all");
    H.enableUploads("postgres");

    //Deny access for all users to writable DB
    cy.updatePermissionsGraph({
      1: {
        [WRITABLE_DB_ID]: {
          "view-data": "blocked",
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
      H.restore("postgres-12");
      cy.signInAsAdmin();

      H.setTokenFeatures("all");
      H.enableUploads("postgres");

      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP]: {
          [WRITABLE_DB_ID]: {
            "view-data": "blocked",
          },
        },
        [NOSQL_GROUP]: {
          [WRITABLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": "query-builder",
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

describe("Upload Table Cleanup/Management", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/ee/upload-management/tables").as(
      "getUploadTables",
    );
    H.restore("postgres-12");
    cy.signInAsAdmin();
    H.enableUploads("postgres");
    H.setTokenFeatures("all");
  });

  it("should allow a user to delete an upload table", () => {
    H.headlessUpload(FIRST_COLLECTION_ID, H.VALID_CSV_FILES[0]);
    H.headlessUpload(FIRST_COLLECTION_ID, H.VALID_CSV_FILES[0]);
    H.headlessUpload(FIRST_COLLECTION_ID, H.VALID_CSV_FILES[0]);

    H.headlessUpload(FIRST_COLLECTION_ID, H.VALID_CSV_FILES[1]);
    H.headlessUpload(FIRST_COLLECTION_ID, H.VALID_CSV_FILES[1]);

    cy.visit("/admin/settings/uploads");
    cy.wait("@getUploadTables");

    cy.findByTestId("upload-tables-table").within(() => {
      cy.findAllByText(/dog_breeds/i).should("have.length", 3);
      cy.findAllByText(/star_wars_characters/i).should("have.length", 2);

      // single delete
      cy.findAllByLabelText("trash icon").first().click();
    });

    H.modal().button("Delete").click();
    cy.wait("@getUploadTables");

    cy.findByTestId("undo-list").findByText(/1 table deleted/i);

    cy.findByTestId("upload-tables-table").within(() => {
      cy.findAllByText(/dog_breeds/i).should("have.length", 2);
      cy.findAllByText(/star_wars_characters/i).should("have.length", 2);

      // multiple delete
      cy.findAllByRole("checkbox").first().click();
      cy.findAllByRole("checkbox").last().click();
    });

    cy.findByTestId("toast-card").button("Delete").click();
    H.modal().button("Delete").click();
    cy.wait("@getUploadTables");

    cy.findByTestId("undo-list").findByText(/2 tables deleted/i);

    cy.findByTestId("upload-tables-table").within(() => {
      cy.findAllByText(/dog_breeds/i).should("have.length", 1);
      cy.findAllByText(/star_wars_characters/i).should("have.length", 1);
    });
  });
});

function uploadFileToCollection(testFile) {
  cy.get("@collectionId").then(collectionId =>
    cy.visit(`/collection/${collectionId}`),
  );

  H.uploadFile("#upload-input", "Uploads Collection", testFile);

  if (testFile.valid) {
    cy.get("main").within(() => cy.findByText("Uploads Collection"));

    cy.findByTestId("collection-table").within(() => {
      cy.findByText(testFile.humanName);
    });

    cy.findByTestId("status-root-container")
      .findByText("Start exploring")
      .click();
    cy.wait("@dataset");

    cy.url().should("include", "/model/");
    cy.findByTestId("TableInteractive-root");
  }
}

function uploadToExisting({
  testFile,
  identicalSchema = true,
  uploadMode = "append",
}) {
  // assumes we're already looking at an uploadable model page
  cy.findByTestId("qb-header").icon("upload").click();

  const uploadOptions = {
    append: "Append data to this model",
    replace: "Replace all data in this model",
  };

  const uploadEndpoints = {
    append: "@appendCSV",
    replace: "@replaceCSV",
  };

  H.popover().findByText(uploadOptions[uploadMode]).click();

  cy.fixture(`${H.FIXTURE_PATH}/${testFile.fileName}`).then(file => {
    cy.get("#upload-file-input").selectFile(
      {
        contents: Cypress.Buffer.from(file),
        fileName: testFile.fileName,
        mimeType: "text/csv",
      },
      { force: true },
    );
  });

  if (identicalSchema) {
    cy.findByTestId("status-root-container")
      .should("contain", "Uploading data to")
      .and("contain", testFile.fileName);

    cy.wait(uploadEndpoints[uploadMode]);

    cy.findAllByRole("status")
      .last()
      .findByText(/Data (added|replaced)/i, {
        timeout: 10 * 1000,
      });
  } else {
    cy.wait(uploadEndpoints[uploadMode]);

    cy.findByTestId("status-root-container").findByText(
      "Error uploading your file",
    );

    H.modal().findByText("Upload error details");
  }
}
