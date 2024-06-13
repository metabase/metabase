// import { WRITABLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
// import { FIRST_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  // queryWritableDB,
  // popover,
  // describeWithSnowplow,
  // expectGoodSnowplowEvent,
  // expectNoBadSnowplowEvents,
  // resetSnowplow,
  // enableTracking,
  setTokenFeatures,
  // modal,
} from "e2e/support/helpers";

// const { NOSQL_GROUP, ALL_USERS_GROUP } = USER_GROUPS;

const FIXTURE_PATH = "../../e2e/support/assets";

const testFiles = [
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
  {
    valid: false,
    fileName: "invalid.csv",
  },
];

describe("CSV Uploading", { tags: ["@external", "@actions"] }, () => {
  // describeWithSnowplow("Upload CSV button in Sidebar", () => {
  testFiles.forEach(testFile => {
    it(`${testFile.valid ? "Can" : "Cannot"} upload ${
      testFile.fileName
    } to "Our analytics" using DWH`, () => {
      cy.intercept("GET", "/api/session/properties").as("getSessionProperties");
      cy.intercept("POST", "/api/card/from-csv").as("uploadCSV");

      restore("postgres-12");
      cy.signInAsAdmin();

      setTokenFeatures("all");
      enableUploads("postgres");

      cy.updatePermissionsGraph({
        1: {
          [WRITABLE_DB_ID]: {
            "view-data": "unrestricted",
            "create-queries": "query-builder",
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
      cy.visit("/");

      // Upload CSV button
      cy.findByTestId("main-navbar-root").within(() => {
        cy.findByText("Upload CSV", { timeout: 30000 });
      });

      // Upload file
      uploadFile(testFile);

      // // Snowplow
      // expectGoodSnowplowEvent({
      //   event: "csv_upload_successful",
      // });
    });
  });
  // });
});

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

function uploadFile(testFile) {
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
      .findByText("Data added to Our analytics", {
        timeout: 10 * 1000,
      });
  } else {
    cy.wait("@uploadCSV");

    cy.findByTestId("status-root-container").findByText(
      "Error uploading your file",
    );
  }
}
