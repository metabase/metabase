cy.describeWithSnowplow(
  "better onboarding via sidebar",
  { tags: "@external" },
  () => {
    afterEach(() => {
      cy.expectNoBadSnowplowEvents();
    });

    describe("Upload CSV for DWH", () => {
      beforeEach(() => {
        cy.resetSnowplow();
        cy.restore("postgres-12");

        cy.signInAsAdmin();
        cy.enableTracking();
        cy.enableUploads("postgres");
        cy.mockSessionPropertiesTokenFeatures({ attached_dwh: true });
      });

      cy.CSV_FILES.forEach(testFile => {
        it(`${testFile.valid ? "Can" : "Cannot"} upload ${
          testFile.fileName
        } to "Our analytics" using DWH`, () => {
          cy.visit("/");
          cy.findByTestId("main-navbar-root").findByText("Upload CSV").click();

          cy.uploadFile("#dwh-upload-csv-input", "Our analytics", testFile);

          cy.expectGoodSnowplowEvent({
            event: "csv_upload_clicked",
            triggered_from: "left-nav",
          });

          cy.expectGoodSnowplowEvent({
            event: testFile.valid
              ? "csv_upload_successful"
              : "csv_upload_failed",
          });
        });
      });
    });

    describe("Add initial database", () => {
      beforeEach(() => {
        cy.resetSnowplow();
        cy.restore();

        cy.signInAsAdmin();
        cy.enableTracking();
      });

      it("should track the button click", () => {
        cy.visit("/");
        cy.findByTestId("main-navbar-root").findByText("Add database").click();
        cy.location("pathname").should("eq", "/admin/databases/create");
        cy.expectGoodSnowplowEvent({
          event: "database_add_clicked",
          triggered_from: "left-nav",
        });
      });
    });
  },
);
