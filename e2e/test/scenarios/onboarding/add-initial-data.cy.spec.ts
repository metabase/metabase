const { H } = cy;

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

      H.CSV_FILES.forEach((testFile) => {
        it(`${testFile.valid ? "Can" : "Cannot"} upload ${
          testFile.fileName
        } to "Our analytics" using DWH`, () => {
          cy.visit("/");
          cy.findByTestId("main-navbar-root")
            .findByText(/Add Data/)
            .click();
          H.popover().findByText("Upload CSV").click();

          H.uploadFile("#dwh-upload-csv-input", "Our analytics", testFile);

          H.expectUnstructuredSnowplowEvent({
            event: "csv_upload_clicked",
            triggered_from: "left-nav",
          });

          H.expectUnstructuredSnowplowEvent({
            event: testFile.valid
              ? "csv_upload_successful"
              : "csv_upload_failed",
          });
        });
      });
    });

    describe("Add data modal", () => {
      beforeEach(() => {
        H.resetSnowplow();
        H.restore();

        cy.signInAsAdmin();
        H.enableTracking();
      });

      it("should track the button click from the 'Getting Started' section", () => {
        cy.visit("/");
        H.navigationSidebar()
          .findByRole("tab", { name: /^Getting Started/i })
          .findByLabelText("Add data")
          .should("be.visible")
          .click();
        addDataModal().should("be.visible");
        H.expectUnstructuredSnowplowEvent({
          event: "data_add_clicked",
          triggered_from: "getting-started",
        });
      });

      it("should track the button click from the 'Getting Started' section", () => {
        cy.visit("/");
        H.navigationSidebar()
          .findByRole("tab", { name: /^Data/i })
          .findByLabelText("Add data")
          .should("be.visible")
          .click();
        addDataModal().should("be.visible");
        H.expectUnstructuredSnowplowEvent({
          event: "data_add_clicked",
          triggered_from: "left-nav",
        });
      });
    });
  },
);

const addDataModal = () => cy.findByRole("dialog", { name: "Add data" });
