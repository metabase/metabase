import { WRITABLE_DB_ID } from "../cypress_data";

export const FIXTURE_PATH = "../../e2e/support/assets";

export const VALID_CSV_FILES = [
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

export const INVALID_CSV_FILES = [
  {
    valid: false,
    fileName: "invalid.csv",
  },
];

export const CSV_FILES = [...VALID_CSV_FILES, ...INVALID_CSV_FILES];

export function enableUploads(dialect) {
  const settings = {
    "uploads-settings": {
      db_id: WRITABLE_DB_ID,
      schema_name: dialect === "postgres" ? "public" : null,
      table_prefix: dialect === "mysql" ? "upload_" : null,
    },
  };

  cy.request("PUT", "/api/setting", settings);
}

export function uploadFile(inputId, collectionName, testFile) {
  cy.fixture(`${FIXTURE_PATH}/${testFile.fileName}`).then(file => {
    cy.get(inputId).selectFile(
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
      .findByText(`Data added to ${collectionName}`, {
        timeout: 10 * 1000,
      });
  } else {
    cy.wait("@uploadCSV");

    cy.findByTestId("status-root-container").findByText(
      "Error uploading your file",
    );
  }
}
