import {
  restore,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  resetSnowplow,
  enableTracking,
  uploadFile,
  CSV_FILES,
  enableUploads,
} from "e2e/support/helpers";

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
    CSV_FILES.forEach(testFile => {
      it(`${testFile.valid ? "Can" : "Cannot"} upload ${
        testFile.fileName
      } to "Our analytics" using DWH`, () => {
        // Upload CSV button
        cy.findByTestId("main-navbar-root").within(() => {
          cy.findByText("Upload CSV", { timeout: 15000 });
        });

        // Upload file
        uploadFile("#upload-csv", "Our analytics", testFile);

        // Snowplow
        expectGoodSnowplowEvent({
          event: "csv_upload_clicked",
          source: "left_nav",
        });
        expectGoodSnowplowEvent({
          event: testFile.valid ? "csv_upload_successful" : "csv_upload_failed",
        });
      });
    });
  });
});
