import {
  restore,
  openOrdersTable,
  popover,
  visualize,
  summarize,
  startNewQuestion,
  filter,
  visitQuestionAdhoc,
  enterCustomColumnDetails,
  openProductsTable,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
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
    // Pluralization isn't reliable so we have to guard against it
    const joinedTable = new RegExp(/Reviews? - Products?/);

    openOrdersTable({ mode: "notebook" });

    // join to Reviews on orders.product_id = reviews.product_id
    cy.icon("join_left_outer").click();

    popover().contains("Reviews").click();
    popover().contains("Product ID").click();
    popover().contains("Product ID").click();

    visualize();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");

    cy.findByTestId("question-table-badges").within(() => {
      cy.findByText("Orders");
      cy.findByText("Reviews");
    });

    // Post-join filters on the joined table (metabase#12221, metabase#15570)
    filter();

    cy.get(".Modal").within(() => {
      cy.findByText(joinedTable).click();
      cy.findByTestId("filter-field-Rating").contains("2").click();
      cy.button("Apply Filters").click();
      cy.wait("@dataset");
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is equal to 2");

    // Post-join aggregation (metabase#11452):
    cy.icon("notebook").click();
    summarize({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Average of ...").click();
    popover().contains(joinedTable).click();
    popover().contains("Rating").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().contains(joinedTable).click();
    popover().contains("Reviewer").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is equal to 2");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 89 rows");

    // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
    saveQuestion();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is equal to 2");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 89 rows");

    function saveQuestion() {
      cy.intercept("POST", "/api/card").as("saveQuestion");
      cy.findByText("Save").click();
      cy.button("Save").click();
      cy.wait("@saveQuestion");
      cy.button("Not now").click();
    }
  });

  it("should join on field literals", () => {
    // create two native questions
    cy.createNativeQuestion({
      name: "question a",
      native: { query: "select 'foo' as a_column" },
    });

    cy.createNativeQuestion({
      name: "question b",
      native: { query: "select 'foo' as b_column" },
    });

    // start a custom question with question a
    startNewQuestion();
    selectSavedQuestionsToJoin("question a", "question b");

    // select the join columns
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("A_COLUMN").click());
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("B_COLUMN").click());

    visualize();

    // check that query worked

    cy.findByTestId("question-table-badges").within(() => {
      cy.findByText("question a");
      cy.findByText("question b");
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A_COLUMN");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question 5 → B Column");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row");
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

    cy.createQuestion({
      name: "Q2",
      query: {
        aggregation: ["sum", ["field", PRODUCTS.RATING, null]],
        breakout: [["field", PRODUCTS.ID, null]],
        "source-table": PRODUCTS_ID,
      },
    });

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Saved Questions").click();
      cy.findByText("Q1").click();
    });

    cy.wait("@metadata");

    cy.icon("join_left_outer").click();

    popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("Q2").click();
    });

    popover().findByText("Product ID").click();
    popover().findByText("ID").click();

    visualize();

    cy.icon("notebook").click();
    cy.url().should("contain", "/notebook");

    // cy.log("joined questions should create custom column (metabase#13649)");
    // add a custom column on top of the steps from the #13000 repro which was simply asserting
    // that a question could be made by joining two previously saved questions
    cy.icon("add_data").click();

    enterCustomColumnDetails({
      formula: "[Question 5 → Sum of Rating] / [Sum of Total]",
      name: "Sum Divide",
    });

    cy.button("Done").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum Divide");
  });

  it("should join saved questions that themselves contain joins (metabase#12928)", () => {
    // Save Question 1
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

    // Save Question 2
    cy.createQuestion({
      name: "12928_Q2",
      query: {
        "source-table": REVIEWS_ID,
        aggregation: [["avg", ["field", REVIEWS.RATING, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }]],
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
    });

    // Join two previously saved questions
    startNewQuestion();
    selectSavedQuestionsToJoin("12928_Q1", "12928_Q2");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/Products? → Category/).click();

    popover()
      .contains(/Products? → Category/)
      .click();

    visualize();

    cy.log("Reported failing in v1.35.4.1 and `master` on July, 16 2020");

    cy.findByTestId("question-table-badges").within(() => {
      cy.findByText("12928_Q1");
      cy.findByText("12928_Q2");
    });

    cy.findAllByText(/Products? → Category/).should("have.length", 1);
    cy.findAllByText(/Question \d+? → Category/).should("have.length", 1);
  });

  it("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", () => {
    const XRAY_DATASETS = 11; // enough to load most questions

    cy.intercept("GET", "/api/automagic-dashboards/adhoc/**").as("xray");
    cy.intercept("POST", "/api/dataset").as("postDataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field", REVIEWS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              alias: "Products",
            },
          ],
          aggregation: [
            ["sum", ["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
          ],
          breakout: [
            ["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    cy.get(".dot").eq(2).click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Automatic insights…").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("X-ray").click();

    cy.wait("@xray").then(xhr => {
      for (let c = 0; c < XRAY_DATASETS; ++c) {
        cy.wait("@postDataset");
      }
      expect(xhr.response.body.cause).not.to.exist;
      expect(xhr.status).not.to.eq(500);
    });

    // Metric title
    cy.findByTextEnsureVisible(
      "How this metric is distributed across different numbers",
    );
    // Main title
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^A closer look at/);
    // Make sure at least one card is rendered
    cy.get(".DashCard");
  });

  it("joining on a question with remapped values should work (metabase#15578)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    // Remap display value
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.createQuestion({
      name: "15578",
      query: { "source-table": ORDERS_ID },
    });

    openProductsTable({ mode: "notebook" });

    cy.icon("join_left_outer").click();

    popover().findByText("Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Saved Questions").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("15578").click();

    popover().findByText("ID").click();
    popover()
      // Implicit assertion - test will fail for multiple strings
      .findByText("Product ID")
      .click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });

  it("should allow joins on multiple dimensions", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openOrdersTable({ mode: "notebook" });

    joinTable("Products");
    selectJoinType("Inner join");

    cy.findByTestId("step-join-0-0").within(() => {
      cy.icon("add").click();
    });

    selectFromDropdown("Created At");
    selectFromDropdown("Created At");

    visualize();

    // 415 rows mean the join is done correctly,
    // (join on product's FK + join on the same "created_at" field)
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 415 rows");
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

  it("should show 'Previous results' instead of a table name for non-field dimensions (metabase#17968)", () => {
    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    selectFromDropdown("Count of rows");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    selectFromDropdown("Created At");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();
    selectFromDropdown("Products");
    selectFromDropdown("Count");

    cy.findByTestId("step-join-1-0")
      .findByTestId("parent-dimension")
      .findByText("Previous results");
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

function selectSavedQuestionsToJoin(firstQuestionName, secondQuestionName) {
  cy.intercept("GET", "/api/database/*/schemas").as("loadSchemas");
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText("Saved Questions").click();
  // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
  cy.findByText(firstQuestionName).click();
  cy.wait("@loadSchemas");

  // join to question b
  cy.icon("join_left_outer").click();

  popover().within(() => {
    cy.findByTextEnsureVisible("Sample Database").click();
    cy.findByTextEnsureVisible("Saved Questions").click();
    cy.findByText(secondQuestionName).click();
  });
}
