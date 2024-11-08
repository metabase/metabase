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
  "better onboarding via sidebar",
  { tags: "@external" },
  () => {
    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    describe("Upload CSV for DWH", () => {
      beforeEach(() => {
        resetSnowplow();
        restore("postgres-12");

        cy.signInAsAdmin();
        enableTracking();
        enableUploads("postgres");
        mockSessionPropertiesTokenFeatures({ attached_dwh: true });
      });

      CSV_FILES.forEach(testFile => {
        it(`${testFile.valid ? "Can" : "Cannot"} upload ${
          testFile.fileName
        } to "Our analytics" using DWH`, () => {
          cy.visit("/");
          cy.findByTestId("main-navbar-root").findByText("Upload CSV").click();

          uploadFile("#dwh-upload-csv-input", "Our analytics", testFile);

          expectGoodSnowplowEvent({
            event: "csv_upload_clicked",
            triggered_from: "left-nav",
          });

          expectGoodSnowplowEvent({
            event: testFile.valid
              ? "csv_upload_successful"
              : "csv_upload_failed",
          });
        });
      });
    });

    describe("Add initial database", () => {
      beforeEach(() => {
        resetSnowplow();
        restore();

        cy.signInAsAdmin();
        enableTracking();
      });

      it("should track the button click", () => {
        cy.visit("/");
        cy.findByTestId("main-navbar-root").findByText("Add database").click();
        cy.location("pathname").should("eq", "/admin/databases/create");
        expectGoodSnowplowEvent({
          event: "database_add_clicked",
          triggered_from: "left-nav",
        });
      });
    });
  },
);
