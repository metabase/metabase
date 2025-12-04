const { H } = cy;

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { QuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID, PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

const productsQuestionDetails: QuestionDetails = {
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PRODUCTS_ID,
    },
  },
};

const peopleQuestionDetails: QuestionDetails = {
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PEOPLE_ID,
    },
  },
};

const ordersQuestionDetails: QuestionDetails = {
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

describe("scenarios > data studio > published tables", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.createLibrary();
  });

  describe("query builder", () => {
    it("should be able to create and save a new question", () => {
      H.publishTables({ table_ids: [PRODUCTS_ID] });
      cy.signIn("nodata");

      cy.visit("/");
      H.newButton("Question").click();
      H.popover().within(() => {
        cy.findByText("Data").click();
        cy.findByText("Products").should("be.visible");
        cy.findByText("Orders").should("not.exist");
        cy.findByText("Products").click();
      });
      H.visualize();
      H.assertQueryBuilderRowCount(200);

      H.saveQuestion("Test question", { wrapId: true });
      H.visitQuestion("@questionId");
      H.assertQueryBuilderRowCount(200);
    });

    it("should be able to drill-thru", () => {
      H.publishTables({ table_ids: [PRODUCTS_ID] });
      cy.signIn("nodata");

      H.visitQuestionAdhoc(productsQuestionDetails);
      H.tableInteractive().findByText("82.75").click();
      H.popover().findByText("=").click();
      H.assertQueryBuilderRowCount(1);
    });

    it("should be able to use explicit joins when not all FK tables are published", () => {
      H.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });
      cy.signIn("nodata");

      H.visitQuestionAdhoc(ordersQuestionDetails, { mode: "notebook" });
      H.getNotebookStep("data").button("Join data").click();
      H.popover().within(() => {
        cy.findByText("Data").click();
        cy.findByText("Products").should("be.visible");
        cy.findByText("People").should("not.exist");
        cy.findByText("Products").click();
      });
      H.getNotebookStep("join").button("Summarize").click();
      H.popover().findByText("Count of rows").click();
      H.visualize();
      H.assertQueryBuilderRowCount(1);
    });

    it("should be able to use implicit joins when not all FK tables are published", () => {
      H.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });
      cy.signIn("nodata");

      H.visitQuestionAdhoc(ordersQuestionDetails, { mode: "notebook" });
      H.getNotebookStep("data").button("Filter").click();
      H.popover().within(() => {
        cy.findByText("Product").should("exist");
        cy.findByText("User").should("not.exist");
        cy.findByText("Product").click();
        cy.findByText("Category").click();
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });
      H.getNotebookStep("filter").button("Summarize").click();
      H.popover().findByText("Count of rows").click();
      H.visualize();
      H.assertQueryBuilderRowCount(1);
    });

    it("should be able to use list field values", () => {
      H.publishTables({ table_ids: [PRODUCTS_ID] });
      cy.signIn("nodata");

      H.visitQuestionAdhoc(productsQuestionDetails);
      H.tableHeaderClick("Category");
      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });
      H.assertQueryBuilderRowCount(53);
    });

    it("should be able to use search field values", () => {
      H.publishTables({ table_ids: [PEOPLE_ID] });
      cy.signIn("nodata");

      H.visitQuestionAdhoc(peopleQuestionDetails);
      H.tableHeaderClick("Name");
      H.popover().findByText("Filter by this column").click();
      popoverByIndex(1).findByText("Aaron Hand").click();
      popoverByIndex(0).findByPlaceholderText("Search by Name").type("Myrtle");
      popoverByIndex(1).findByText("Myrtle Johns").click();
      popoverByIndex(0).findByPlaceholderText("Search by Name").type("{esc}");
      H.popover().within(() => {
        cy.findByText("Aaron Hand").should("be.visible");
        cy.findByText("Myrtle Johns").should("be.visible");
        cy.button("Add filter").click();
      });
      H.assertQueryBuilderRowCount(2);
    });
  });
});

function popoverByIndex(index: number) {
  return H.popover().should("have.length", 2).eq(index);
}
