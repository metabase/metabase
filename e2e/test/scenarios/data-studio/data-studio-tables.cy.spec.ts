const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > library > tables", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  describe("overview", () => {
    it("should show the table overview, edit its description and name, and unpublish it", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);

      cy.log("Verify page breadcrumbs");
      H.DataStudio.breadcrumbs().within(() => {
        cy.findByRole("link", { name: "Semantic layer" }).should("be.visible");
        cy.findByRole("link", { name: "Data" }).should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });

      cy.log("Verify the table data");
      H.queryVisualizationRoot().within(() => {
        cy.findByText("Subtotal").should("be.visible");
        cy.findByText("110.93").should("be.visible");
      });

      cy.log("Verify additional properties in the sidebar");
      H.DataStudio.Tables.Overview.descriptionSidebar().within(() => {
        cy.findByText("Entity type").should("be.visible");

        cy.findByText("Last edited at").should("be.visible");

        cy.findByText("Database").should("be.visible");
        cy.findByText("Sample Database").should("be.visible");

        cy.findByText("Source").should("be.visible");
        cy.findByPlaceholderText("Select a data source").should(
          "have.value",
          "Ingested",
        );

        cy.findByText("Owner").should("be.visible");

        cy.findByPlaceholderText("Pick someone, or type an email").should(
          "have.value",
          "No owner",
        );
        cy.findByText("Fields").should("be.visible");

        cy.findByText("Dependents").should("be.visible");
      });

      cy.log("Change the description");
      H.DataStudio.Tables.Overview.descriptionText()
        .should("contain.text", "orders for a product")
        .click();
      H.DataStudio.Tables.Overview.descriptionInput()
        .clear()
        .type("Description changed")
        .blur();
      H.undoToastList()
        .contains("Table description updated")
        .should("be.visible");

      cy.log("Change the name");
      H.DataStudio.Tables.nameInput().should("have.value", "Orders");
      H.DataStudio.Tables.nameInput().clear().type("Orders changed").blur();
      H.undoToastList().contains("Table name updated").should("be.visible");

      cy.log("Unpublish the table");
      H.DataStudio.Library.visit();
      H.DataStudio.Library.tableItem("Orders changed").click();
      H.DataStudio.Tables.moreMenu().click();
      H.popover().findByText("Unpublish").click();
      H.modal().findByText("Unpublish this table").click();
      H.DataStudio.Library.emptyStateRow(
        "Cleaned, pre-transformed data sources ready for exploring",
      ).should("be.visible");
      H.DataStudio.Library.allTableItems().should("have.length", 0);
    });
  });

  describe("fields", () => {
    it("should close field panels, rename a field, and view the table in the query builder", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });

      cy.log("Close the field details and preview panels");
      H.DataStudio.Tables.visitFieldsPage(ORDERS_ID);
      H.DataModel.TableSection.clickField("Total");
      H.DataModel.FieldSection.getPreviewButton().click({
        scrollBehavior: "center",
      });
      H.DataModel.PreviewSection.get().should("be.visible");
      H.DataModel.FieldSection.get().should("be.visible");

      H.DataModel.FieldSection.getCloseButton().click();

      H.DataModel.PreviewSection.get().should("not.exist");
      H.DataModel.FieldSection.get().should("not.exist");

      H.DataModel.TableSection.clickField("Discount");
      H.DataModel.FieldSection.get().should("exist");
      H.DataModel.PreviewSection.get().should("not.exist");

      cy.log("Rename a field");
      H.DataStudio.Tables.overviewTab().click();
      H.tableHeaderColumn("Total").should("be.visible");

      H.DataStudio.Tables.fieldsTab().click();
      H.DataModel.TableSection.clickField("Total");
      H.DataModel.FieldSection.getNameInput()
        .clear()
        .type("Total changed")
        .blur();
      H.undoToast().findByText("Name of Total updated").should("be.visible");

      H.DataStudio.Tables.overviewTab().click();
      H.tableHeaderColumn("Total changed").should("be.visible");

      cy.log("View the table in the query builder");
      H.DataStudio.Tables.moreMenu().click();
      H.DataStudio.Tables.moreMenuViewTable();

      H.queryBuilderHeader().within(() => {
        cy.icon("repository").should("be.visible");
        cy.findByText("Data").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
    });
  });

  describe("dependencies", () => {
    it("should be able to view dependencies for a table", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
      H.createQuestion({
        name: "Test question",
        query: { "source-table": ORDERS_ID },
      });
      H.waitForBackfillComplete();
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
      H.DataStudio.Tables.dependenciesTab().click();
      H.DependencyGraph.graph().within(() => {
        cy.findByText("Orders").should("be.visible");
        cy.findByText(/question/).click();
      });
      H.DependencyGraph.dependencyPanel()
        .findByText("Test question")
        .should("be.visible");
    });
  });
});
