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

      it("should track the button click from the 'Data' section", () => {
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

        // TODO: Extract into a separate test once we add csv and google sheets tabs
        addDataModal()
          .findAllByRole("tab")
          .filter(":contains(Database)")
          .click();
        H.expectUnstructuredSnowplowEvent({
          event: "database_setup_clicked",
          triggered_from: "add-data-modal",
        });
      });
    });
  },
);

describe("Add data modal", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should work properly for admins", () => {
    cy.signInAsAdmin();
    cy.visit("/");
    H.navigationSidebar()
      .findByRole("tab", { name: /^Data/i })
      .findByLabelText("Add data")
      .should("be.visible")
      .click();

    addDataModal().within(() => {
      cy.log("Admin should be able to manage databases");
      cy.findByRole("link", { name: "Manage databases" }).should(
        "have.attr",
        "href",
        "/admin/databases",
      );

      cy.log("Elevated engines should be shown initially");
      cy.findAllByRole("option")
        .should("have.length", 6)
        .and("contain", "MySQL")
        .and("contain", "PostgreSQL")
        .and("contain", "SQL Server")
        .and("contain", "Amazon Redshift")
        .and("contain", "BigQuery")
        .and("contain", "Snowflake");

      cy.log("The list is initially not expanded");
      cy.findByText("Show more").should("be.visible");

      cy.log("Searching automatically expands the list");
      cy.findByPlaceholderText("Search databases").type("re");
      cy.findAllByRole("option").should("contain", "Presto");

      cy.log(
        "Collapsing the list resets search value and shows the initial elevated engines list",
      );
      cy.findByText("Hide").click();
      cy.findByPlaceholderText("Search databases").should("have.value", "");
      cy.findAllByRole("option")
        .should("have.length", 6)
        .and("contain", "MySQL")
        .and("contain", "PostgreSQL")
        .and("contain", "SQL Server")
        .and("contain", "Amazon Redshift")
        .and("contain", "BigQuery")
        .and("contain", "Snowflake")
        .and("not.contain", "Presto");

      cy.log("Admin can manually expand the list");
      cy.findByText("Show more").click();
      cy.findAllByRole("option").should("have.length.greaterThan", 6);

      cy.log("Clicking on an engine opens the database form for that engine");
      cy.findByText("Snowflake").click();
      cy.location("pathname").should("eq", "/admin/databases/create");
      cy.location("search").should("eq", "?engine=snowflake");
    });

    H.modal().within(() => {
      cy.findByText("Add a database").should("be.visible");
      cy.findByLabelText("Database type").should("contain", "Snowflake");
    });
  });

  it("should show empty state for non-admins", () => {
    cy.signInAsNormalUser();
    cy.visit("/");
    H.navigationSidebar()
      .findByRole("tab", { name: /^Data/i })
      .findByLabelText("Add data")
      .should("be.visible")
      .click();

    addDataModal().within(() => {
      cy.findByRole("heading", { name: "Add a database" }).should("be.visible");
      cy.findByText(
        "Start exploring in minutes. We support more than 20 data connectors.",
      ).should("be.visible");
      cy.findByRole("alert").should(
        "contain",
        "To add a new database, please contact your administrator.",
      );

      cy.findByRole("link", { name: "Manage databases" }).should("not.exist");
    });
  });

  it("should not offer to add data when in full app embedding", () => {
    cy.signInAsNormalUser();
    H.visitFullAppEmbeddingUrl({ url: "/", qs: {} });

    H.navigationSidebar().within(() => {
      cy.findByText("Home").should("be.visible");
      cy.log("Make sure we don't display the 'Getting Started' section");
      cy.findByText(/Getting Started/i).should("not.exist");
      cy.findByText("Add data").should("not.exist");

      cy.log(
        "Make sure we don't display the 'Add' button in the 'Data' section",
      );
      cy.findByText(/^Data$/i).should("be.visible");
      cy.findByText("Add").should("not.exist");

      cy.log("Both buttons have the same label, and neither should exist");
      cy.findByLabelText("Add data").should("not.exist");
    });
  });

  it("should hide Getting Started but still offer to add data for white labeled instances", () => {
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
    // The condition will not kick in without changing the app name. Do not remove this API call.
    cy.request("PUT", "/api/setting/application-name", {
      value: "FooBar, Inc.",
    });

    cy.visit("/");
    H.navigationSidebar().within(() => {
      cy.findByText("Home").should("be.visible");
      cy.findByText(/Getting Started/i).should("not.exist");

      cy.log("Adding data from the 'Data' section should work");
      cy.findByRole("tab", { name: /^Data/i })
        .findByLabelText("Add data")
        .click();
    });

    addDataModal().should("be.visible");
  });
});

const addDataModal = () => cy.findByRole("dialog", { name: "Add data" });
