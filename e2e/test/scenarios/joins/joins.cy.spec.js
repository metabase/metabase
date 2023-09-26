import {
  addCustomColumn,
  restore,
  openOrdersTable,
  openNotebook,
  popover,
  visualize,
  summarize,
  startNewQuestion,
  filter,
  enterCustomColumnDetails,
  selectSavedQuestionsToJoin,
  queryBuilderMain,
  getNotebookStep,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

describe("scenarios > question > joined questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow joins on tables (metabase#11452, metabase#12221, metabase#13468, metabase#15570)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.button("Join data").click();
    popover().contains("Reviews").click();
    popover().contains("Product ID").click();
    popover().contains("Product ID").click();

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

    popover().findByText("Average of ...").click();
    popover().contains("Review").click();
    popover().contains("Rating").click();

    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().contains("Review").click();
    popover().contains("Reviewer").click();

    visualize();

    cy.findByTestId("qb-filters-panel").findByText("Rating is equal to 2");
    cy.findByTestId("question-row-count").contains("Showing 89 rows");

    // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
    saveQuestion();

    cy.findByTestId("qb-filters-panel").findByText("Rating is equal to 2");
    cy.findByTestId("question-row-count").contains("Showing 89 rows");

    function saveQuestion() {
      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.findByText("Save").click();
      cy.button("Save").click();
      cy.wait("@saveQuestion");
      cy.button("Not now").click();
    }
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

    cy.findByTestId("question-row-count").contains("Showing 1 row");
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
    cy.button("Done").click();

    visualize();
    queryBuilderMain().findByText("Sum Divide");
  });

  it("should join saved questions that themselves contain joins (metabase#12928)", () => {
    cy.createQuestion({
      name: "12928_Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ["field", PEOPLE.SOURCE, { "join-alias": "People - User" }],
        ],
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
          {
            alias: "People - User",
            condition: [
              "=",
              ["field", ORDERS.USER_ID, null],
              ["field", PEOPLE.ID, { "join-alias": "People - User" }],
            ],
            fields: "all",
            "source-table": PEOPLE_ID,
          },
        ],
      },
    });

    cy.createQuestion(
      {
        name: "12928_Q2",
        query: {
          "source-table": REVIEWS_ID,
          aggregation: [["avg", ["field", REVIEWS.RATING, null]]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ],
          joins: [
            {
              alias: "Products",
              condition: [
                "=",
                ["field", REVIEWS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
        },
      },
      {
        wrapId: true,
        idAlias: "joinedQuestionId",
      },
    );

    startNewQuestion();
    selectSavedQuestionsToJoin("12928_Q1", "12928_Q2");
    popover().findByText("Products → Category").click();
    popover().findByText("Products → Category").click();

    visualize();

    cy.get("@joinedQuestionId").then(joinedQuestionId => {
      assertJoinValid({
        lhsTable: "12928_Q1",
        rhsTable: "12928_Q2",
        lhsSampleColumn: "Products → Category",
        rhsSampleColumn: `Question ${joinedQuestionId} → Category`,
      });
    });

    cy.findByTestId("question-row-count").contains("Showing 20 rows");
  });

  it("should allow joins on multiple dimensions", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openOrdersTable({ mode: "notebook" });

    joinTable("Products");
    selectJoinType("Inner join");

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
    cy.findByTestId("question-row-count").contains("Showing 415 rows");
  });

  it("should allow joins on date-time fields", () => {
    openOrdersTable({ mode: "notebook" });

    joinTable("Products");
    selectJoinType("Inner join");

    // Test join dimension infers parent dimension's temporal unit

    cy.findByTestId("parent-dimension").click();
    selectFromDropdown("by month", { force: true });
    selectFromDropdown("Week");

    cy.findByTestId("join-dimension").click();
    selectFromDropdown("Created At");

    assertDimensionName("parent", "Created At: Week");
    assertDimensionName("join", "Created At: Week");

    // Test changing a temporal unit on one dimension would update a second one

    cy.findByTestId("join-dimension").click();
    selectFromDropdown("by week", { force: true });
    selectFromDropdown("Day");

    assertDimensionName("parent", "Created At: Day");
    assertDimensionName("join", "Created At: Day");

    summarize({ mode: "notebook" });
    selectFromDropdown("Count of rows");

    visualize();

    // 2087 rows mean the join is done correctly,
    // (orders joined with products on the same day-month-year)
    cy.get(".ScalarValue").contains("2,087");
  });
});

function joinTable(table) {
  cy.findByText("Join data").click();
  popover().findByText(table).click();
}

function selectJoinType(strategy) {
  cy.icon("join_left_outer").first().click();
  popover().findByText(strategy).click();
}

function selectFromDropdown(option, clickOpts) {
  popover().last().findByText(option).click(clickOpts);
}

function assertDimensionName(type, name) {
  cy.findByTestId(`${type}-dimension`).within(() => {
    cy.findByText(name);
  });
}

function assertJoinValid({
  lhsTable,
  rhsTable,
  lhsSampleColumn,
  rhsSampleColumn,
}) {
  // Ensure the QB shows `${lhsTable} + ${rhsTable}` in the header
  cy.findByTestId("question-table-badges").within(() => {
    cy.findByText(lhsTable).should("be.visible");
    cy.findByText(rhsTable).should("be.visible");
  });

  // Ensure the results have columns from both tables
  queryBuilderMain().within(() => {
    cy.findByText(lhsSampleColumn).should("be.visible");
    cy.findByText(rhsSampleColumn).should("be.visible");
  });
}
