import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

const { H } = cy;

describe("scenarios - embedding hub", () => {
  describe("checklist", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
      H.activateToken("pro-cloud");
    });

    it("Contains setup guide in sidebar", () => {
      cy.visit("/admin/embedding");

      cy.findByTestId("admin-layout-sidebar")
        .findByText("Setup guide")
        .should("exist")
        .click();

      cy.findByTestId("admin-layout-content")
        .findByRole("heading", { name: "Embedding setup guide" })
        .should("exist");
    });

    it('"Generate a dashboard" card should work correctly', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.log("Find and click on 'Generate a dashboard' card");
      cy.findByTestId("admin-layout-content")
        .findByText("Generate a dashboard")
        .click();

      cy.log("Select a table to generate dashboard from");
      H.modal().within(() => {
        cy.findByText("Choose a table to generate a dashboard").should(
          "be.visible",
        );
        // Click on the first available table
        cy.get("[data-testid='picker-item']").first().click();
      });

      cy.log("Should navigate to auto dashboard creation");
      cy.url().should("include", "/auto/dashboard/table/");
    });

    it('"Add data" card should work correctly', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.log("Find and click on 'Add data' card");
      cy.findByTestId("admin-layout-content").findByText("Add data").click();

      cy.log("Add data modal should open");
      cy.findByRole("dialog").within(() => {
        cy.findByRole("heading", { name: "Add data" }).should("be.visible");
      });
    });

    it("Uploading CSVs to sample database should mark the 'Add Data' step as done", () => {
      cy.intercept("GET", "/api/ee/embedding-hub/checklist").as("getChecklist");

      cy.log("Enable CSV uploads");
      cy.request("PUT", "/api/setting/uploads-settings", {
        value: {
          db_id: 1, // Sample Database ID
          schema_name: "PUBLIC",
          table_prefix: null,
        },
      });

      cy.visit("/admin/embedding/setup-guide");

      cy.log("'Add data' should not be marked as done");
      cy.findByTestId("admin-layout-content")
        .findByText("Add data")
        .closest("button")
        .findByText("Done")
        .should("not.exist");

      cy.findByTestId("admin-layout-content").findByText("Add data").click();

      H.modal().within(() => {
        cy.findByText("CSV").click();

        cy.log("Upload a CSV file");
        cy.get("#add-data-modal-upload-csv-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              "header1,header2\nvalue1,value2",
              "utf8",
            ),
            fileName: "test-upload.csv",
            mimeType: "text/csv",
            lastModified: Date.now(),
          },
          { force: true },
        );

        cy.button("Upload").should("be.enabled").click();
      });

      cy.wait("@getChecklist");

      cy.log("'Add data' should be marked as done");
      cy.findByTestId("admin-layout-content")
        .findByText("Add data")
        .closest("button")
        .scrollIntoView()
        .findByText("Done")
        .should("be.visible");
    });

    [
      { dbId: 1, dbName: "sample db" },
      { dbId: 2, dbName: "sqlite db" },
    ].forEach(({ dbId, dbName }) => {
      it(`"Create models" step should be marked in ${dbName} as done after creating a model`, () => {
        if (dbId === 2) {
          H.addSqliteDatabase(dbName);
        }

        cy.log("Create a native query model via API");
        H.createNativeQuestion(
          {
            name: "Test Model",
            type: "model",
            database: dbId,
            native: { query: "SELECT 1 as t" },
          },
          { visitQuestion: true },
        );

        cy.log("Navigate to embedding setup guide");
        cy.visit("/admin/embedding/setup-guide");

        cy.log("'Create models' should now be marked as done");
        cy.findByTestId("admin-layout-content")
          .findByText("Create models")
          .closest("button")
          .scrollIntoView()
          .findByText("Done", { timeout: 10_000 })
          .should("be.visible");
      });
    });

    it('"Embed in your code" card should take you to the embed flow', () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.findByTestId("admin-layout-content")
        .findByText("Embed in your code")
        .click();

      cy.url().should("include", "/embed-js?auth_method=user_session");
    });

    it("Embed in production step should be locked until JWT is enabled", () => {
      cy.visit("/admin/embedding/setup-guide");

      cy.findByTestId("admin-layout-content")
        .findByText("Embed in production")
        .scrollIntoView()
        .should("be.visible")
        .closest("button")
        .icon("lock")
        .should("be.visible");

      enableJwtAuth();
      cy.reload();

      cy.findByTestId("admin-layout-content")
        .findByText("Embed in production")
        .scrollIntoView()
        .should("be.visible")
        .closest("button")
        .icon("lock")
        .should("not.exist");
    });

    it("embedding checklist should show up on the embedding homepage", () => {
      cy.request("PUT", "/api/setting/embedding-homepage", {
        value: "visible",
      });

      cy.visit("/");

      cy.findAllByText("Get started with Embedded Analytics JS")
        .first()
        .should("be.visible");

      cy.get("main").within(() => {
        cy.findByText("Create models").should("be.visible");
        cy.findByText("Generate a dashboard").should("be.visible");
        cy.findByText("Add data").should("be.visible").click();
      });

      cy.log("Sanity check: add data modal should open");
      cy.findByRole("dialog").within(() => {
        cy.findByRole("heading", { name: "Add data" }).should("be.visible");
      });
    });

    it("embedding checklist should not show up on the embedding homepage if not enabled", () => {
      cy.visit("/");

      cy.get("main")
        .findByText("Get started with Embedded Analytics JS")
        .should("not.exist");
    });

    it("overflow menu > customize homepage opens modal with correct title", () => {
      cy.request("PUT", "/api/setting/embedding-homepage", {
        value: "visible",
      });

      cy.visit("/");

      cy.log("Click overflow menu button on the embedding homepage");
      cy.get("main").within(() => {
        cy.findByLabelText("More options").click();
      });

      H.menu().findByText("Customize homepage").click();

      cy.findByRole("dialog").within(() => {
        cy.findByText("Pick a dashboard to appear on the homepage").should(
          "be.visible",
        );
      });
    });

    it("overflow menu > dismiss guide hides the embedding homepage", () => {
      cy.request("PUT", "/api/setting/embedding-homepage", {
        value: "visible",
      });

      cy.visit("/");

      cy.get("main")
        .findByText("Get started with Embedded Analytics JS")
        .should("be.visible");

      cy.log("Click overflow menu button on the embedding homepage");
      cy.get("main").within(() => {
        cy.findByLabelText("More options").click();
      });

      H.menu().findByText("Dismiss guide").click();

      cy.log("Verify guide is dismissed and no longer visible");
      cy.get("main")
        .findByText("Get started with Embedded Analytics JS")
        .should("not.exist");
    });
  });
});
