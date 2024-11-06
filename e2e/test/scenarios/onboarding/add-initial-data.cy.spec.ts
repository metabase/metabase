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

describe("onboarding sidebar section", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
});

describeWithSnowplow(
  "Upload CSV for DWH",
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
      cy.findByTestId("main-navbar-root").findByText("Upload CSV").click();
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    CSV_FILES.forEach(testFile => {
      it(`${testFile.valid ? "Can" : "Cannot"} upload ${
        testFile.fileName
      } to "Our analytics" using DWH`, () => {
        uploadFile("#dwh-upload-csv-input", "Our analytics", testFile);

        expectGoodSnowplowEvent({
          event: "csv_upload_clicked",
          triggered_from: "left-nav",
        });

        expectGoodSnowplowEvent({
          event: testFile.valid ? "csv_upload_successful" : "csv_upload_failed",
        });
      });
    });
  },
);
