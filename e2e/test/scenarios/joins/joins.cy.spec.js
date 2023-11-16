import {
  addCustomColumn,
  addSummaryField,
  addSummaryGroupingField,
  assertJoinValid,
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  filter,
  getNotebookStep,
  join,
  joinTable,
  openNotebook,
  openOrdersTable,
  popover,
  queryBuilderMain,
  restore,
  saveQuestion,
  selectSavedQuestionsToJoin,
  startNewQuestion,
  summarize,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > joined questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should join raw tables (metabase#11452, metabase#12221, metabase#13468, metabase#15570)", () => {
    openOrdersTable({ mode: "notebook" });

    join();
    joinTable("Reviews", "Product ID", "Product ID");

    visualize();
    assertJoinValid({
      lhsTable: "Orders",
      rhsTable: "Reviews",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Reviews - Product → ID",
    });

    openNotebook();
    getNotebookStep("join").icon("chevrondown").click();
    popover().within(() => {
      cy.findByText("Product ID").click();
      cy.findByText("Body").click();
      cy.findByText("Created At").click();
    });
    visualize();

    assertJoinValid({
      lhsTable: "Orders",
      rhsTable: "Reviews",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Reviews - Product → Reviewer",
    });
    queryBuilderMain().findByText("Body").should("not.exist");

    // Post-join filters on the joined table (metabase#12221, metabase#15570)
    openNotebook();
    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Review").click();
      cy.findByText("Rating").click();
      cy.findByLabelText("2").click();
      cy.button("Add filter").click();
    });

    // Post-join aggregation (metabase#11452):
    summarize({ mode: "notebook" });
    addSummaryField({
      metric: "Average of ...",
      table: "Review",
      field: "Rating",
    });
    addSummaryGroupingField({ table: "Review", field: "Reviewer" });

    visualize();

    cy.findByTestId("qb-filters-panel").findByText(
      "Reviews - Product → Rating is equal to 2",
    );
    assertQueryBuilderRowCount(89);

    // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
    saveQuestion();

    cy.findByTestId("qb-filters-panel").findByText(
      "Reviews - Product → Rating is equal to 2",
    );
    assertQueryBuilderRowCount(89);
  });

  it("should join a native question", () => {
    cy.createNativeQuestion({
      name: "question a",
      native: { query: "select ID, PRODUCT_ID, TOTAL from orders" },
    });

    cy.createNativeQuestion({
      name: "question b",
      native: { query: "select * from products" },
    });

    startNewQuestion();
    selectSavedQuestionsToJoin("question a", "question b");
    popover().findByText("PRODUCT_ID").click();
    popover().findByText("ID").click();

    visualize();

    assertJoinValid({
      lhsTable: "question a",
      rhsTable: "question b",
      lhsSampleColumn: "TOTAL",
      rhsSampleColumn: "question b - PRODUCT_ID → ID",
    });

    openNotebook();
    getNotebookStep("join").icon("chevrondown").click();
    popover().within(() => {
      cy.findByText("EAN").click();
      cy.findByText("VENDOR").click();
      cy.findByText("PRICE").click();
      cy.findByText("CATEGORY").click();
      cy.findByText("CREATED_AT").click();
    });
    visualize();
    assertJoinValid({
      lhsTable: "question a",
      rhsTable: "question b",
      lhsSampleColumn: "TOTAL",
      rhsSampleColumn: "question b - PRODUCT_ID → Rating",
    });
    queryBuilderMain().findByText("EAN").should("not.exist");

    openNotebook();
    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("question b").click();
      cy.findByText("CATEGORY").click();
      cy.findByPlaceholderText("Enter some text").type("Gadget");
      cy.button("Add filter").click();
    });

    summarize({ mode: "notebook" });
    addSummaryGroupingField({
      table: "question b",
      field: "CATEGORY",
    });
    visualize();

    cy.findByTestId("qb-filters-panel")
      .findByText("question b - PRODUCT_ID → Category is Gadget")
      .should("be.visible");
    cy.get(".ScalarValue").contains("Gadget").should("be.visible");
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

    startNewQuestion();
    selectSavedQuestionsToJoin("Q1", "Q2");
    visualize();

    assertJoinValid({
      lhsTable: "Q1",
      rhsTable: "Q2",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Q2 - Product → ID",
    });

    openNotebook();
    getNotebookStep("join").icon("chevrondown").click();
    popover().findByText("ID").click();
    visualize();

    assertJoinValid({
      lhsTable: "Q1",
      rhsTable: "Q2",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Q2 - Product → Sum of Total",
    });
    queryBuilderMain().findByText("Q2 → ID").should("not.exist");

    openNotebook();
    // add a custom column on top of the steps from the #13000 repro which was simply asserting
    // that a question could be made by joining two previously saved questions
    addCustomColumn();
    enterCustomColumnDetails({
      formula: "[Q2 - Product → Sum of Rating] / [Sum of Total]",
      name: "Sum Divide",
    });
    popover().button("Done").click();

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Q2").click();
      cy.findByText("ID").click();
      cy.findByPlaceholderText("Enter an ID").type("12");
      cy.button("Add filter").click();
    });

    visualize();
    queryBuilderMain().findByText("Sum Divide");

    cy.findByTestId("qb-filters-panel")
      .findByText("Q2 - Product → ID is 12")
      .should("be.visible");
  });

  it("should handle joins on different stages", () => {
    openOrdersTable({ mode: "notebook" });

    join();
    joinTable("Products");

    summarize({ mode: "notebook" });
    addSummaryField({ metric: "Count of rows" });
    addSummaryGroupingField({ table: "Product", field: "ID" });

    cy.findAllByTestId("action-buttons").last().button("Join data").click();
    joinTable("Reviews", "ID", "Product ID");
    visualize();

    assertJoinValid({
      lhsSampleColumn: "Count",
      rhsSampleColumn: "Reviews → ID",
    });
    assertQueryBuilderRowCount(1136);
  });

  it("should allow joins with multiple conditions", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openOrdersTable({ mode: "notebook" });

    join();
    joinTable("Products");
    selectJoinStrategy("Inner join");

    getNotebookStep("join").icon("add").click();
    popover().findByText("Created At").click();
    popover().findByText("Created At").click();

    visualize();

    assertJoinValid({
      lhsTable: "Orders",
      rhsTable: "Products",
      lhsSampleColumn: "Product ID",
      rhsSampleColumn: "Products → ID",
    });
    assertQueryBuilderRowCount(415);
  });

  it("should sync join condition's date-time column units", () => {
    openOrdersTable({ mode: "notebook" });

    join();
    joinTable("Products");
    selectJoinStrategy("Inner join");

    // Test LHS column infers RHS column's temporal unit

    cy.findByLabelText("Left column").click();
    popover().findByText("by month").click({ force: true });
    popover().last().findByText("Week").click();

    cy.findByLabelText("Right column").click();
    popover().findByText("Created At").click();

    assertJoinColumnName("left", "Created At: Week");
    assertJoinColumnName("right", "Created At: Week");

    // Test changing a temporal unit on one column would update a second one

    cy.findByLabelText("Right column").click();
    popover().findByText("by week").click({ force: true });
    popover().last().findByText("Day").click();

    assertJoinColumnName("left", "Created At: Day");
    assertJoinColumnName("right", "Created At: Day");

    summarize({ mode: "notebook" });
    addSummaryField({ metric: "Count of rows" });

    visualize();

    cy.get(".ScalarValue").contains("2,087");
  });

  it("should remove a join when changing the source table", () => {
    visitQuestionAdhoc(
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

    getNotebookStep("data").findByTestId("data-step-cell").click();
    popover().findByText("People").click();

    getNotebookStep("join").should("not.exist");

    visualize();
    queryBuilderMain()
      .findAllByText(/Product/)
      .should("have.length", 0);
  });
});

function selectJoinStrategy(strategy) {
  cy.findByLabelText("Change join type").click();
  popover().findByText(strategy).click();
}

function assertJoinColumnName(side, name) {
  const label = side === "left" ? "Left column" : "Right column";
  cy.findByLabelText(label).findByText(name).should("exist");
}
