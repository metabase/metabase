const { H } = cy;

import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { QuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, PEOPLE_ID } = SAMPLE_DATABASE;

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
    it("should create a question based on a published table", () => {
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

    it("should create a question with explicit joins when not all FK tables are published", () => {
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

      H.saveQuestion("Test question", { wrapId: true });
      H.visitQuestion("@questionId");
      H.assertQueryBuilderRowCount(1);
    });

    it("should create a question with implicit joins when not all FK tables are published", () => {
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

      H.saveQuestion("Test question", { wrapId: true });
      H.visitQuestion("@questionId");
      H.assertQueryBuilderRowCount(1);
    });

    it("should create a question with a table segment", () => {
      H.createSegment({
        name: "ID segment",
        table_id: PRODUCTS_ID,
        definition: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
            filter: ["=", ["field", PRODUCTS.ID, null], 1],
          },
        },
      });
      H.publishTables({ table_ids: [PRODUCTS_ID] });

      cy.signIn("nodata");
      H.visitQuestionAdhoc(productsQuestionDetails, { mode: "notebook" });
      H.getNotebookStep("data").button("Filter").click();
      H.popover().findByText("ID segment").click();
      H.visualize();
      H.assertQueryBuilderRowCount(1);

      H.saveQuestion("Test question", { wrapId: true });
      H.visitQuestion("@questionId");
      H.assertQueryBuilderRowCount(1);
    });

    it("should create a question with a table metric", () => {
      H.createQuestion({
        name: "Count metric",
        type: "metric",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
        },
      });
      H.publishTables({ table_ids: [PRODUCTS_ID] });

      cy.signIn("nodata");
      H.visitQuestionAdhoc(productsQuestionDetails, { mode: "notebook" });
      H.getNotebookStep("data").button("Summarize").click();
      H.popover().within(() => {
        cy.findByText("Metrics").click();
        cy.findByText("Count metric").click();
      });
      H.visualize();
      H.assertQueryBuilderRowCount(1);

      H.saveQuestion("Test question", { wrapId: true });
      H.visitQuestion("@questionId");
      H.assertQueryBuilderRowCount(1);
    });

    it("should create a question with table and question sources", () => {
      H.publishTables({ table_ids: [PRODUCTS_ID] });

      cy.signIn("nodata");
      H.visitQuestionAdhoc(productsQuestionDetails, { mode: "notebook" });
      H.getNotebookStep("data").button("Join data").click();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        cy.findByText("Orders").click();
      });
      H.getNotebookStep("join").button("Summarize").click();
      H.popover().findByText("Count of rows").click();
      H.visualize();
      H.assertQueryBuilderRowCount(1);

      H.saveQuestion("Test question", { wrapId: true });
      H.visitQuestion("@questionId");
      H.assertQueryBuilderRowCount(1);
    });

    it("should be able to drill-thru", () => {
      H.publishTables({ table_ids: [PRODUCTS_ID] });

      cy.signIn("nodata");
      H.visitQuestionAdhoc(productsQuestionDetails);
      H.tableInteractive().findByText("82.75").click();
      H.popover().findByText("=").click();
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

    it("should be able to use list field values with FK remapping", () => {
      cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
        has_field_values: "list",
      });
      cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });
      H.publishTables({ table_ids: [ORDERS_ID] });

      cy.signIn("nodata");
      H.visitQuestionAdhoc(ordersQuestionDetails);
      H.tableInteractive()
        .findByText("Awesome Concrete Shoes")
        .should("be.visible");
      H.tableHeaderClick("Product ID");
      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Rustic Paper Wallet").click();
        cy.button("Add filter").click();
      });
      H.assertQueryBuilderRowCount(93);
    });

    it("should be able to use search field values with remapping", () => {
      cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
        has_field_values: "search",
      });
      cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });
      H.publishTables({ table_ids: [ORDERS_ID] });

      cy.signIn("nodata");
      H.visitQuestionAdhoc(ordersQuestionDetails);
      H.tableInteractive()
        .findByText("Awesome Concrete Shoes")
        .should("be.visible");
      H.tableHeaderClick("Product ID");
      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByPlaceholderText("Search by Title or enter an ID").type(
          "Rustic Paper",
        );
        cy.findByText("Rustic Paper Wallet").click();
        cy.button("Add filter").click();
      });
      H.assertQueryBuilderRowCount(93);
    });

    it("should be able to use list field values with sandboxing", () => {
      H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
      sandboxProductsOnCategory();
      H.publishTables({ table_ids: [PRODUCTS_ID] });

      cy.signIn("sandboxed");
      H.visitQuestionAdhoc(productsQuestionDetails);
      H.tableHeaderClick("Category");
      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Widget").should("be.visible");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").click();
        cy.button("Add filter").click();
      });
      H.assertQueryBuilderRowCount(54);
    });

    it("should be able to use search field values with sandboxing", () => {
      cy.request("PUT", `/api/field/${PRODUCTS.CATEGORY}`, {
        has_field_values: "search",
      });
      H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
      sandboxProductsOnCategory();
      H.publishTables({ table_ids: [PRODUCTS_ID] });

      cy.signIn("sandboxed");
      H.visitQuestionAdhoc(productsQuestionDetails);
      H.tableHeaderClick("Category");
      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByPlaceholderText("Search by Category").type("get");
        cy.findByText("Widget").should("be.visible");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").click();
        cy.button("Add filter").click();
      });
      H.assertQueryBuilderRowCount(54);
    });

    it("should not be able to access the table data when blocked", () => {
      H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
      H.blockUserGroupPermissions(USER_GROUPS.COLLECTION_GROUP);
      H.publishTables({ table_ids: [PRODUCTS_ID] });

      cy.signIn("nodata");
      H.visitQuestionAdhoc(productsQuestionDetails);
      H.main()
        .findByText("Sorry, you don't have permission to run this query.")
        .should("be.visible");
    });
  });
});

function popoverByIndex(index: number) {
  return H.popover().should("have.length", 2).eq(index);
}

function sandboxProductsOnCategory() {
  cy.sandboxTable({
    table_id: PRODUCTS_ID,
    attribute_remappings: {
      attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  });
}
