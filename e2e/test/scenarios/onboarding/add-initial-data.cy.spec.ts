import { H } from "e2e/support";

H.describeWithSnowplow(
  "better onboarding via sidebar",
  { tags: "@external" },
  () => {
    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    describe("Upload CSV for DWH", () => {
      beforeEach(() => {
        H.resetSnowplow();
        H.restore("postgres-12");

        cy.signInAsAdmin();
        H.enableTracking();
        H.enableUploads("postgres");
        H.mockSessionPropertiesTokenFeatures({ attached_dwh: true });
      });

      H.CSV_FILES.forEach(testFile => {
        it(`${testFile.valid ? "Can" : "Cannot"} upload ${
          testFile.fileName
        } to "Our analytics" using DWH`, () => {
          cy.visit("/");
          cy.findByTestId("main-navbar-root").findByText("Upload CSV").click();

          H.uploadFile("#dwh-upload-csv-input", "Our analytics", testFile);

          H.expectGoodSnowplowEvent({
            event: "csv_upload_clicked",
            triggered_from: "left-nav",
          });

          H.expectGoodSnowplowEvent({
            event: testFile.valid
              ? "csv_upload_successful"
              : "csv_upload_failed",
          });
        });
      });
    });

    describe("Add initial database", () => {
      beforeEach(() => {
        H.resetSnowplow();
        H.restore();

        cy.signInAsAdmin();
        H.enableTracking();
      });

      it("should track the button click", () => {
        cy.visit("/");
        cy.findByTestId("main-navbar-root").findByText("Add database").click();
        cy.location("pathname").should("eq", "/admin/databases/create");
        H.expectGoodSnowplowEvent({
          event: "database_add_clicked",
          triggered_from: "left-nav",
        });
      });
    });
  },
);
