const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > library > tables", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  describe("header", () => {
    it("should be able to change the name", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });

      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
      H.DataStudio.Tables.nameInput().should("have.value", "Orders");
      H.DataStudio.Tables.nameInput().clear().type("Orders changed").blur();
      H.undoToastList().contains("Table name updated").should("be.visible");
    });

    it("should be able to view the table in the query builder", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });

      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
      H.DataStudio.Tables.moreMenu().click();
      H.DataStudio.Tables.moreMenuViewTable();

      H.queryBuilderHeader().within(() => {
        cy.icon("repository").should("be.visible");
        cy.findByText("Data").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
    });

    it("should be able to unpublish a table", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
      H.DataStudio.Library.visit();
      H.DataStudio.Library.tableItem("Orders").click();
      H.DataStudio.Tables.moreMenu().click();
      H.popover().findByText("Unpublish").click();
      H.modal().findByText("Unpublish this table").click();
      H.DataStudio.Library.allTableItems().should("have.length", 0);
    });
  });

  describe("overview", () => {
    beforeEach(() => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
    });

    it("should show page breadcrumbs", () => {
      H.DataStudio.breadcrumbs().within(() => {
        cy.findByRole("link", { name: "Library" }).should("be.visible");
        cy.findByRole("link", { name: "Data" }).should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
    });

    it("should be able to view the table data", () => {
      H.queryVisualizationRoot().within(() => {
        cy.findByText("Subtotal").should("be.visible");
        cy.findByText("110.93").should("be.visible");
      });
    });

    it("should be able to change the description", () => {
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
    });
  });

  describe("fields", () => {
    beforeEach(() => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });
    });

    it("should be able to rename fields", () => {
      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
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
    });

    it("should allow you to close field details and preview panels", () => {
      H.DataStudio.Tables.visitFieldsPage(ORDERS_ID);
      H.DataModel.TableSection.clickField("Total");
      H.DataModel.FieldSection.getPreviewButton().click({
        scrollBehavior: "center",
      });

      H.DataModel.FieldSection.getCloseButton().click();

      H.DataModel.PreviewSection.get().should("not.exist");
      H.DataModel.FieldSection.get().should("not.exist");

      H.DataModel.TableSection.clickField("Discount");
      H.DataModel.PreviewSection.get().should("not.exist");
      H.DataModel.FieldSection.get().should("exist");
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
