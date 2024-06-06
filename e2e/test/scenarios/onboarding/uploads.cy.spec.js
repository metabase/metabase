// import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  describeWithSnowplow,
  setTokenFeatures,
} from "e2e/support/helpers";

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
  {
    fileName: "pokedex.tsv",
    tableName: "pokedex",
    humanName: "Pokedex",
    rowCount: 202,
  },
];

// const invalidTestFiles = [
//   {
//     fileName: "invalid.csv",
//   },
// ];

xdescribe("CSV Uploading", { tags: ["@external", "@actions"] }, () => {
  describeWithSnowplow("Upload CSV button in Sidebar", () => {
    it("Can upload a CSV file in the DWH", () => {
      cy.intercept("GET", "/api/session/properties").as("getSessionProperties");

      restore("postgres-12");
      cy.signInAsAdmin();

      setTokenFeatures("all");

      cy.findByTestId("main-navbar-root").within(() => {
        cy.findByText("Upload CSV");
        uploadFile(validTestFiles[0], "postgres");
      });
    });
  });
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
    cy.findByTestId("status-root-container")
      .should("contain", "Uploading data to")
      .and("contain", testFile.fileName);

    cy.wait("@uploadCSV");

    cy.findAllByRole("status")
      .last()
      .findByText("Data added to Uploads Collection", {
        timeout: 10 * 1000,
      });
  } else {
    cy.wait("@uploadCSV");

    cy.findByTestId("status-root-container").findByText(
      "Error uploading your file",
    );
  }
}
