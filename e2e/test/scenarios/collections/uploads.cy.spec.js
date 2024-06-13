import { WRITABLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
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
  modal,
} from "e2e/support/helpers";

const { NOSQL_GROUP, ALL_USERS_GROUP } = USER_GROUPS;

const FIXTURE_PATH = "../../e2e/support/assets";

const validTestFiles = [
  {
    valid: true,
    fileName: "dog_breeds.csv",
    tableName: "dog_breeds",
    humanName: "Dog Breeds",
    rowCount: 97,
  },
  {
    valid: true,
    fileName: "star_wars_characters.csv",
    tableName: "star_wars_characters",
    humanName: "Star Wars Characters",
    rowCount: 87,
  },
  {
    valid: true,
    fileName: "pokedex.tsv",
    tableName: "pokedex",
    humanName: "Pokedex",
    rowCount: 202,
  },
];

const invalidTestFiles = [
  {
    valid: false,
    fileName: "invalid.csv",
  },
];

describeWithSnowplow(
  "CSV Uploading",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.intercept("POST", "/api/card/from-csv").as("uploadCSV");
      cy.intercept("POST", "/api/table/*/append-csv").as("appendCSV");
      cy.intercept("POST", "/api/table/*/replace-csv").as("replaceCSV");
    });

    it("Can upload a CSV file to an empty postgres schema", () => {
      const testFile = validTestFiles[0];
      const EMPTY_SCHEMA_NAME = "empty_uploads";

      cy.intercept("PUT", "/api/setting").as("saveSettings");
      cy.intercept("GET", "/api/database").as("databaseList");

      restore("postgres-writable");
      cy.signInAsAdmin();

      queryWritableDB(
        "DROP SCHEMA IF EXISTS empty_uploads CASCADE;",
        "postgres",
      );
      queryWritableDB("CREATE SCHEMA IF NOT EXISTS empty_uploads;", "postgres");

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
      popover().findByText("Writable Postgres12").click();
      cy.findByLabelText("Upload Settings Form")
        .findByText("Select a schema")
        .click();

      popover().findByText(EMPTY_SCHEMA_NAME).click();

      cy.findByLabelText("Upload Settings Form")
        .button("Enable uploads")
        .click();

      cy.wait(["@saveSettings", "@databaseList"]);

      uploadFile(testFile);

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

    ["postgres", "mysql"].forEach(dialect => {
      describe(`CSV Uploading (${dialect})`, () => {
        beforeEach(() => {
          restore(`${dialect}-writable`);
          resetSnowplow();
          cy.signInAsAdmin();
          enableTracking();

          cy.request("POST", "/api/collection", {
            name: "Uploads Collection",
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
              const tableName =
                result.rows[0].table_name ?? result.rows[0].TABLE_NAME;
              queryWritableDB(
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

        invalidTestFiles.forEach(testFile => {
          it(`Cannot upload ${testFile.fileName} to a collection`, () => {
            uploadFile(testFile);

            expectGoodSnowplowEvent({
              event: "csv_upload_failed",
            });

            const tableQuery = `SELECT * FROM information_schema.tables WHERE table_name LIKE '%${testFile.tableName}_%' ORDER BY table_name DESC LIMIT 1;`;

            queryWritableDB(tableQuery, dialect).then(result => {
              expect(result.rows.length).to.equal(0);
            });
          });
        });

        describe("CSV appends", () => {
          it("Can append a CSV file to an existing table", () => {
            uploadFile(validTestFiles[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: validTestFiles[0],
              uploadMode: "append",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount * 2} rows`,
            );
          });

          it("Cannot append a CSV file to a table with a different schema", () => {
            uploadFile(validTestFiles[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: validTestFiles[1],
              valid: false,
              uploadMode: "append",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount} rows`,
            );
          });
        });

        describe("CSV replacement", () => {
          it("Can replace data in an existing table", () => {
            uploadFile(validTestFiles[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: validTestFiles[0],
              uploadMode: "replace",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount} rows`,
            );
          });

          it("Cannot data in a table with a different schema", () => {
            uploadFile(validTestFiles[0]);
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount} rows`,
            );

            uploadToExisting({
              testFile: validTestFiles[1],
              valid: false,
              uploadMode: "replace",
            });
            cy.findByTestId("view-footer").findByText(
              `Showing ${validTestFiles[0].rowCount} rows`,
            );
          });
        });
      });
    });
  },
);

describe("permissions", () => {
  it("should not show you upload buttons if you are a sandboxed user", () => {
    restore("postgres-12");
    cy.signInAsAdmin();

    setTokenFeatures("all");
    enableUploads("postgres");

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
      restore("postgres-12");
      cy.signInAsAdmin();

      setTokenFeatures("all");
      enableUploads("postgres");

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
    restore("postgres-12");
    cy.signInAsAdmin();
    enableUploads("postgres");
    setTokenFeatures("all");
  });

  it("should allow a user to delete an upload table", () => {
    headlessUpload(validTestFiles[0]);
    headlessUpload(validTestFiles[0]);
    headlessUpload(validTestFiles[0]);

    headlessUpload(validTestFiles[1]);
    headlessUpload(validTestFiles[1]);

    cy.visit("/admin/settings/uploads");
    cy.wait("@getUploadTables");

    cy.findByTestId("upload-tables-table").within(() => {
      cy.findAllByText(/dog_breeds/i).should("have.length", 3);
      cy.findAllByText(/star_wars_characters/i).should("have.length", 2);

      // single delete
      cy.findAllByLabelText("trash icon").first().click();
    });

    modal().button("Delete").click();
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
    modal().button("Delete").click();
    cy.wait("@getUploadTables");

    cy.findByTestId("undo-list").findByText(/2 tables deleted/i);

    cy.findByTestId("upload-tables-table").within(() => {
      cy.findAllByText(/dog_breeds/i).should("have.length", 1);
      cy.findAllByText(/star_wars_characters/i).should("have.length", 1);
    });
  });
});

function uploadFile(testFile) {
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

  if (testFile.valid) {
    cy.findByTestId("status-root-container")
      .should("contain", "Uploading data to")
      .and("contain", testFile.fileName);

    cy.wait("@uploadCSV");

    cy.findAllByRole("status")
      .last()
      .findByText("Data added to Uploads Collection", {
        timeout: 10 * 1000,
      });

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
  } else {
    cy.wait("@uploadCSV");

    cy.findByTestId("status-root-container").findByText(
      "Error uploading your file",
    );
  }
}

function uploadToExisting({ testFile, valid = true, uploadMode = "append" }) {
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

  popover().findByText(uploadOptions[uploadMode]).click();

  cy.fixture(`${FIXTURE_PATH}/${testFile.fileName}`).then(file => {
    cy.get("#upload-file-input").selectFile(
      {
        contents: Cypress.Buffer.from(file),
        fileName: testFile.fileName,
        mimeType: "text/csv",
      },
      { force: true },
    );
  });

  if (valid) {
    cy.findByTestId("status-root-container")
      .should("contain", "Uploading data to")
      .and("contain", testFile.fileName);

    cy.wait(uploadEndpoints[uploadMode]);

    cy.findByTestId("status-root-container").findByText(
      /Data (added|replaced)/i,
      {
        timeout: 10 * 1000,
      },
    );
  } else {
    cy.wait(uploadEndpoints[uploadMode]);

    cy.findByTestId("status-root-container").findByText(
      "Error uploading your file",
    );

    modal().findByText("Upload error details");
  }
}

function headlessUpload(file) {
  cy.fixture(`${FIXTURE_PATH}/${file.fileName}`)
    .then(file => Cypress.Blob.binaryStringToBlob(file))
    .then(blob => {
      const formData = new FormData();
      formData.append("file", blob, file.fileName);
      formData.append("collection_id", FIRST_COLLECTION_ID);

      cy.request({
        url: "/api/card/from-csv",
        method: "POST",
        headers: {
          "content-type": "multipart/form-data",
        },
        body: formData,
      });
    });
}

function enableUploads(dialect) {
  const settings = {
    "uploads-settings": {
      db_id: WRITABLE_DB_ID,
      schema_name: dialect === "postgres" ? "public" : null,
      table_prefix: dialect === "mysql" ? "upload_" : null,
    },
  };

  cy.request("PUT", "/api/setting", settings);
}
