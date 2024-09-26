import {
  CSV_FILES,
  describeWithSnowplow,
  enableTracking,
  enableUploads,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  mockSessionPropertiesTokenFeatures,
  resetSnowplow,
  restore,
  uploadFile,
} from "e2e/support/helpers";

describeWithSnowplow(
  "Upload CSVs button in Sidebar",
  { tags: ["@external", "@actions"] },
  () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();

      enableUploads("postgres");
      mockSessionPropertiesTokenFeatures({ attached_dwh: true });

      resetSnowplow();
      cy.signInAsAdmin();
      enableTracking();
      cy.visit("/");
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
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
          triggered_from: "left_nav",
        });
        expectGoodSnowplowEvent({
          event: testFile.valid ? "csv_upload_successful" : "csv_upload_failed",
        });
      });
    });
  },
);
