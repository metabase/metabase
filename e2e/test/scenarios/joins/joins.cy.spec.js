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
  visualize,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > joined questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow joins on tables (metabase#11452, metabase#12221, metabase#13468, metabase#15570)", () => {
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

    // Post-join filters on the joined table (metabase#12221, metabase#15570)
    filter();
    cy.get(".Modal").within(() => {
      // Temporal compat between MLv1 and MLv2
      // MLv2 does a better job naming joined tables,
      // but simple mode filters UI still uses MLv1
      // Once it's ported, we should just look for "Review"
      const joinedTable = new RegExp(/Reviews? - Products?/);
      cy.findByText(joinedTable).click();
      cy.findByTestId("filter-field-Rating").contains("2").click();
      cy.button("Apply Filters").click();
      cy.wait("@dataset");
    });

    cy.findByTestId("qb-filters-panel").findByText("Rating is equal to 2");

    // Post-join aggregation (metabase#11452):
    openNotebook();

    summarize({ mode: "notebook" });
    addSummaryField({
      metric: "Average of ...",
      table: "Review",
      field: "Rating",
    });
    addSummaryGroupingField({ table: "Review", field: "Reviewer" });

    visualize();

    cy.findByTestId("qb-filters-panel").findByText("Rating is equal to 2");
    assertQueryBuilderRowCount(89);

    // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
    saveQuestion();

    cy.findByTestId("qb-filters-panel").findByText("Rating is equal to 2");
    assertQueryBuilderRowCount(89);
  });

  it("should join on field literals", () => {
    cy.createNativeQuestion({
      name: "question a",
      native: { query: "select 'foo' as a_column" },
    });

    cy.createNativeQuestion(
      {
        name: "question b",
        native: { query: "select 'foo' as b_column" },
      },
      {
        wrapId: true,
        idAlias: "joinedQuestionId",
      },
    );

    startNewQuestion();
    selectSavedQuestionsToJoin("question a", "question b");
    popover().findByText("A_COLUMN").click();
    popover().findByText("B_COLUMN").click();

    visualize();

    cy.get("@joinedQuestionId").then(joinedQuestionId => {
      assertJoinValid({
        lhsTable: "question a",
        rhsTable: "question b",
        lhsSampleColumn: "A_COLUMN",
        rhsSampleColumn: `Question ${joinedQuestionId} → B Column`,
      });
    });

    assertQueryBuilderRowCount(1);
  });

  it("should allow joins based on saved questions (metabase#13000, metabase#13649, metabase#13744)", () => {
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

    cy.createQuestion(
      {
        name: "Q2",
        query: {
          aggregation: ["sum", ["field", PRODUCTS.RATING, null]],
          breakout: [["field", PRODUCTS.ID, null]],
          "source-table": PRODUCTS_ID,
        },
      },
      {
        wrapId: true,
        idAlias: "joinedQuestionId",
      },
    );

    startNewQuestion();

    selectSavedQuestionsToJoin("Q1", "Q2");
    popover().findByText("Product ID").click();
    popover().findByText("ID").click();

    visualize();

    cy.get("@joinedQuestionId").then(joinedQuestionId => {
      assertJoinValid({
        lhsTable: "Q1",
        rhsTable: "Q2",
        lhsSampleColumn: "Product ID",
        rhsSampleColumn: `Question ${joinedQuestionId} → ID`,
      });
    });

    openNotebook();

    // cy.log("joined questions should create custom column (metabase#13649)");
    // add a custom column on top of the steps from the #13000 repro which was simply asserting
    // that a question could be made by joining two previously saved questions
    addCustomColumn();
    cy.get("@joinedQuestionId").then(joinedQuestionId => {
      enterCustomColumnDetails({
        formula: `[Question ${joinedQuestionId} → Sum of Rating] / [Sum of Total]`,
        name: "Sum Divide",
      });
    });
    popover().button("Done").click();

    visualize();
    queryBuilderMain().findByText("Sum Divide");
  });

  it("should allow joins on multiple dimensions", () => {
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

  it("should allow joins on date-time fields", () => {
    openOrdersTable({ mode: "notebook" });

    join();
    joinTable("Products");
    selectJoinStrategy("Inner join");

    // Test join dimension infers parent dimension's temporal unit

    cy.findByTestId("parent-dimension").click();
    popover().findByText("by month").click({ force: true });
    popover().last().findByText("Week").click();

    cy.findByTestId("join-dimension").click();
    popover().findByText("Created At").click();

    assertJoinColumnName("left", "Created At: Week");
    assertJoinColumnName("right", "Created At: Week");

    // Test changing a temporal unit on one dimension would update a second one

    cy.findByTestId("join-dimension").click();
    popover().findByText("by week").click({ force: true });
    popover().last().findByText("Day").click();

    assertJoinColumnName("left", "Created At: Day");
    assertJoinColumnName("right", "Created At: Day");

    summarize({ mode: "notebook" });
    addSummaryField({ metric: "Count of rows" });

    visualize();

    cy.get(".ScalarValue").contains("2,087");
  });
});

function selectJoinStrategy(strategy) {
  cy.icon("join_left_outer").first().click();
  popover().findByText(strategy).click();
}

function assertJoinColumnName(type, name) {
  const testId = type === "left" ? "parent-dimension" : "join-dimension";
  cy.findByTestId(testId).findByText(name).should("be.visible");
}
