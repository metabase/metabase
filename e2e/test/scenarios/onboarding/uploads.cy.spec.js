import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  resetSnowplow,
  enableTracking,
} from "e2e/support/helpers";

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
  before(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    enableUploads("postgres");
  });

  beforeEach(() => {
    cy.intercept({ method: "GET", url: "/api/session/properties" }, request => {
      request.on("response", response => {
        if (typeof response.body === "object") {
          // Setting the DWH feature
          const tokenFeatures = response.body["token-features"];
          response.body = {
            ...response.body,
            "token-features": { ...tokenFeatures, attached_dwh: true },
          };
        }
      });
    }).as("getSessionProperties");
    cy.intercept("POST", "/api/card/from-csv").as("uploadCSV");

    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
    cy.visit("/");
  });

  describeWithSnowplow("Upload CSV button in Sidebar", () => {
    testFiles.forEach(testFile => {
      it(`${testFile.valid ? "Can" : "Cannot"} upload ${
        testFile.fileName
      } to "Our analytics" using DWH`, () => {
        // Upload CSV button
        cy.findByTestId("main-navbar-root").within(() => {
          cy.findByText("Upload CSV", { timeout: 15000 });
        });

        // Upload file
        uploadFile(testFile);

        // Snowplow
        expectGoodSnowplowEvent({
          event: "csv_upload_left_nav_clicked",
        });
        if (testFile.valid) {
          expectGoodSnowplowEvent({
            event: "csv_upload_successful",
          });
        } else {
          expectGoodSnowplowEvent({
            event: "csv_upload_failed",
          });
        }
      });
    });
  });
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
