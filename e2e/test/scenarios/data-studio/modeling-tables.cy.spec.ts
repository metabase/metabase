const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > data studio > modeling > tables", () => {
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

      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
      H.DataStudio.Tables.moreMenu().click();
      H.popover().findByText("Unpublish").click();
      H.modal().findByText("Unpublish this table").click();
      H.DataStudio.Modeling.emptyPage().should("be.visible");
    });
  });

  describe("overview", () => {
    it("should be able to view the table data", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });

      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
      H.queryVisualizationRoot().within(() => {
        cy.findByText("Subtotal").should("be.visible");
        cy.findByText("110.93").should("be.visible");
      });
    });

    it("should be able to change the description", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });

      H.DataStudio.Tables.visitOverviewPage(ORDERS_ID);
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
    it("should be able to rename fields", () => {
      H.createLibrary();
      H.publishTables({ table_ids: [ORDERS_ID] });

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
