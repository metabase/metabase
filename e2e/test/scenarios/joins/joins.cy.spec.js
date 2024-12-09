import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > joined questions", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should join raw tables (metabase#11452, metabase#12221, metabase#13468, metabase#15570)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.join();
    H.joinTable("Reviews", "Product ID", "Product ID");

    H.visualize();
    H.assertJoinValid({
      lhsTable: "Orders",
      rhsTable: "Reviews",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Reviews - Product → ID",
    });

    H.openNotebook();
    H.getNotebookStep("join").icon("chevrondown").click();
    H.popover().within(() => {
      cy.findByText("Product ID").click();
      cy.findByText("Body").click();
      cy.findByText("Created At").click();
    });
    H.visualize();

    H.assertJoinValid({
      lhsTable: "Orders",
      rhsTable: "Reviews",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Reviews - Product → Reviewer",
    });
    H.queryBuilderMain().findByText("Body").should("not.exist");

    // Post-join filters on the joined table (metabase#12221, metabase#15570)
    H.openNotebook();
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Reviews").click();
      cy.findByText("Rating").click();
    });
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByLabelText("2").click();
      cy.button("Add filter").click();
    });

    // Post-join aggregation (metabase#11452):
    H.summarize({ mode: "notebook" });
    H.addSummaryField({
      metric: "Average of ...",
      table: "Reviews",
      field: "Rating",
    });
    H.addSummaryGroupingField({ table: "Reviews", field: "Reviewer" });

    H.visualize();

    cy.findByTestId("qb-filters-panel").findByText(
      "Reviews - Product → Rating is equal to 2",
    );
    H.assertQueryBuilderRowCount(89);

    // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
    H.saveQuestion();

    cy.findByTestId("qb-filters-panel").findByText(
      "Reviews - Product → Rating is equal to 2",
    );
    H.assertQueryBuilderRowCount(89);
  });

  it("should join a native question (metabase#37100)", () => {
    cy.createNativeQuestion({
      name: "question a",
      native: { query: "select ID, PRODUCT_ID, TOTAL from orders" },
    });

    cy.createNativeQuestion({
      name: "question b",
      native: { query: "select * from products" },
    });

    H.startNewQuestion();
    H.selectSavedQuestionsToJoin("question a", "question b");
    H.popover().findByText("PRODUCT_ID").click();
    H.popover().findByText("ID").click();

    H.visualize();

    H.assertJoinValid({
      lhsTable: "question a",
      rhsTable: "question b",
      lhsSampleColumn: "TOTAL",
      rhsSampleColumn: "question b - PRODUCT_ID → ID",
    });

    H.openNotebook();
    H.getNotebookStep("join").icon("chevrondown").click();
    H.popover().within(() => {
      cy.findByText("EAN").click();
      cy.findByText("VENDOR").click();
      cy.findByText("PRICE").click();
      cy.findByText("CATEGORY").click();
      cy.findByText("CREATED_AT").click();
    });
    H.visualize();
    H.assertJoinValid({
      lhsTable: "question a",
      rhsTable: "question b",
      lhsSampleColumn: "TOTAL",
      rhsSampleColumn: "question b - PRODUCT_ID → Rating",
    });
    H.queryBuilderMain().findByText("EAN").should("not.exist");

    H.openNotebook();
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("question b").click();
      cy.findByText("CATEGORY").click();
    });
    H.selectFilterOperator("Is");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Gadget");
      cy.button("Add filter").click();
    });

    H.summarize({ mode: "notebook" });
    H.addSummaryGroupingField({
      table: "question b",
      field: "CATEGORY",
    });
    H.visualize();

    cy.findByTestId("qb-filters-panel")
      .findByText("question b - PRODUCT_ID → Category is Gadget")
      .should("be.visible");
    cy.findByTestId("scalar-value").contains("Gadget").should("be.visible");
  });

  it("should join structured questions (metabase#13000, metabase#13649, metabase#13744)", () => {
    cy.intercept("GET", `/api/table/${PRODUCTS_ID}/query_metadata`).as(
      "metadata",
    );

    cy.createQuestion({
      name: "Q1",
      query: {
        aggregation: ["sum", ["field", ORDERS.TOTAL, null]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        // Make sure it works if a question has sorted metric (metabase#13744)
        "order-by": [["asc", ["aggregation", 0]]],
        "source-table": ORDERS_ID,
      },
    });

    cy.createQuestion({
      name: "Q2",
      query: {
        aggregation: ["sum", ["field", PRODUCTS.RATING, null]],
        breakout: [["field", PRODUCTS.ID, null]],
        "source-table": PRODUCTS_ID,
      },
    });

    H.startNewQuestion();
    H.selectSavedQuestionsToJoin("Q1", "Q2");
    H.visualize();

    H.assertJoinValid({
      lhsTable: "Q1",
      rhsTable: "Q2",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Q2 - Product → ID",
    });

    H.openNotebook();
    H.getNotebookStep("join").icon("chevrondown").click();
    H.popover().findByText("ID").click();
    H.visualize();

    H.assertJoinValid({
      lhsTable: "Q1",
      rhsTable: "Q2",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Q2 - Product → Sum of Total",
    });
    H.queryBuilderMain().findByText("Q2 → ID").should("not.exist");

    H.openNotebook();
    // add a custom column on top of the steps from the #13000 repro which was simply asserting
    // that a question could be made by joining two previously saved questions
    H.addCustomColumn();
    H.enterCustomColumnDetails({
      formula: "[Q2 - Product → Sum of Rating] / [Sum of Total]",
      name: "Sum Divide",
    });
    H.popover().button("Done").click();

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Q2").click();
      cy.findByText("ID").click();
      cy.findByPlaceholderText("Enter an ID").type("12");
      cy.button("Add filter").click();
    });

    H.visualize();
    H.queryBuilderMain().findByText("Sum Divide");

    cy.findByTestId("qb-filters-panel")
      .findByText("Q2 - Product → ID is 12")
      .should("be.visible");
  });

  it("should handle joins on different stages", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.join();
    H.joinTable("Products");

    H.summarize({ mode: "notebook" });
    H.addSummaryField({ metric: "Count of rows" });
    H.addSummaryGroupingField({ table: "Products", field: "ID" });

    cy.findAllByTestId("action-buttons").last().button("Join data").click();
    H.joinTable("Reviews");
    H.visualize();

    H.assertJoinValid({
      lhsSampleColumn: "Count",
      rhsSampleColumn: "Reviews → ID",
    });
    H.assertQueryBuilderRowCount(1136);
  });

  it("should allow joins with multiple conditions", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.openOrdersTable({ mode: "notebook" });

    H.join();
    H.joinTable("Products");
    selectJoinStrategy("Inner join");

    H.getNotebookStep("join").icon("add").click();
    H.popover().findByText("Created At").click();
    H.popover().findByText("Created At").click();

    H.visualize();

    H.assertJoinValid({
      lhsTable: "Orders",
      rhsTable: "Products",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Products → ID",
    });
    H.assertQueryBuilderRowCount(415);
  });

  it("should sync join condition's date-time column units", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.join();
    H.joinTable("Products");
    selectJoinStrategy("Inner join");

    // Test LHS column infers RHS column's temporal unit

    cy.findByLabelText("Left column").click();
    H.popover().findByText("Created At").click();

    cy.findByLabelText("Right column").click();
    H.popover().findByText("by month").click({ force: true });
    H.popover().last().findByText("Week").click();

    assertJoinColumnName("left", "Created At: Week");
    assertJoinColumnName("right", "Created At: Week");

    // Test changing a temporal unit on one column would update a second one

    cy.findByLabelText("Right column").click();
    H.popover().findByText("by week").click({ force: true });
    H.popover().last().findByText("Day").click();

    assertJoinColumnName("left", "Created At: Day");
    assertJoinColumnName("right", "Created At: Day");

    H.summarize({ mode: "notebook" });
    H.addSummaryField({ metric: "Count of rows" });

    H.visualize();

    cy.findByTestId("scalar-value").contains("2,087");
  });

  it("should remove a join when changing the source table", () => {
    H.visitQuestionAdhoc(
      {
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                alias: "Products",
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  ["field", PRODUCTS.ID, { "join-alias": "Products" }],
                ],
                fields: "all",
                "source-table": PRODUCTS_ID,
              },
            ],
          },
        },
      },
      { mode: "notebook" },
    );

    H.getNotebookStep("data").findByTestId("data-step-cell").click();
    H.entityPickerModal().findByText("People").click();

    H.getNotebookStep("join").should("not.exist");

    H.visualize();
    H.queryBuilderMain()
      .findAllByText(/Product/)
      .should("have.length", 0);
  });
});

function selectJoinStrategy(strategy) {
  cy.findByLabelText("Change join type").click();
  H.popover().findByText(strategy).click();
}

function assertJoinColumnName(side, name) {
  const label = side === "left" ? "Left column" : "Right column";
  cy.findByLabelText(label).findByText(name).should("exist");
}
