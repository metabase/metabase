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
  "Add data via onboarding section in the main sidebar",
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
      cy.findByTestId("main-navbar-root").findByText("Add data").click();
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    it('should track clicking on "Add a database" button', () => {
      cy.findAllByRole("menuitem").contains("Add a database").click();
      cy.location("pathname").should("eq", "/admin/databases/create");
      expectGoodSnowplowEvent({
        event: "data_add_via_db_clicked",
      });
    });

    CSV_FILES.forEach(testFile => {
      it(`${testFile.valid ? "Can" : "Cannot"} upload ${
        testFile.fileName
      } to "Our analytics" using DWH`, () => {
        cy.findAllByRole("menuitem").contains("Upload a spreadsheet").click();
        uploadFile("#onboarding-upload-input", "Our analytics", testFile);

        expectGoodSnowplowEvent({
          event: "data_add_via_csv_clicked",
        });

        expectGoodSnowplowEvent({
          event: testFile.valid ? "csv_upload_successful" : "csv_upload_failed",
        });
      });
    });
  },
);
