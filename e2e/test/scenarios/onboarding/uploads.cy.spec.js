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

describeWithSnowplow(
  "Upload CSVs button in Sidebar",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();

      enableUploads("postgres");

      cy.intercept(
        { method: "GET", url: "/api/session/properties" },
        request => {
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
        },
      ).as("getSessionProperties");

      resetSnowplow();
      cy.signInAsAdmin();
      enableTracking();
      cy.visit("/");
    });

    CSV_FILES.forEach(testFile => {
      it(`${testFile.valid ? "Can" : "Cannot"} upload ${
        testFile.fileName
      } to "Our analytics" using DWH`, () => {
        // Upload CSVs button
        cy.findByTestId("main-navbar-root").within(() => {
          cy.findByText("Upload CSVs", { timeout: 15000 });
        });

        // Upload file
        uploadFile("#upload-input", "Our analytics", testFile);

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
  },
);
