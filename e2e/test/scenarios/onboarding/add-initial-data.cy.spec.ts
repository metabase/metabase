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

  it(
    "data menu should be usable on small screens",
    { viewportHeight: 667, viewportWidth: 375 },
    () => {
      cy.visit("/");
      cy.findByTestId("sidebar-toggle").click();
      cy.findByTestId("main-navbar-root").within(() => {
        cy.findByText("Home").should("be.visible");
        cy.findByText("Add data").as("dataButton").click();
      });

      cy.findByRole("menu").then(menu => {
        cy.log("Make sure menu is not overwlowing the screen");
        const menuRect = menu[0].getBoundingClientRect();
        expect(menuRect.left).to.be.gte(0);
        expect(menuRect.right).to.be.lte(Cypress.config("viewportWidth"));
        cy.get("@dataButton").then(btn => {
          cy.log("Make sure the menu sits above the button");
          const btnRect = btn[0].getBoundingClientRect();
          expect(btnRect.top).to.be.gte(menuRect.bottom);
        });
      });
    },
  );
});

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
