import {
  restore,
  openOrdersTable,
  popover,
  visualize,
  startNewQuestion,
  enterCustomColumnDetails,
  visitQuestionAdhoc,
  summarize,
  filter,
  visitQuestion,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

  describe("joins", () => {
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

      cy.findByText("Rating is equal to 2");

      // Post-join aggregation (metabase#11452):
      cy.icon("notebook").click();
      summarize({ mode: "notebook" });

      cy.findByText("Average of ...").click();
      popover().contains(joinedTable).click();
      popover().contains("Rating").click();

      cy.findByText("Pick a column to group by").click();
      popover().contains(joinedTable).click();
      popover().contains("Reviewer").click();

      visualize();

      cy.findByText("Rating is equal to 2");
      cy.findByText("Showing 89 rows");

      // Make sure UI overlay doesn't obstruct viewing results after we save this question (metabase#13468)
      saveQuestion();

      cy.findByText("Rating is equal to 2");
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
      cy.findByText("Saved Questions").click();
      cy.findByText("question a").click();

      // join to question b
      cy.icon("join_left_outer").click();

      popover().within(() => {
        cy.findByTextEnsureVisible("Sample Database").click({ force: true });
        cy.findByTextEnsureVisible("Saved Questions").click();
        cy.findByText("question b").click();
      });

      // select the join columns
      popover().within(() => cy.findByText("A_COLUMN").click());
      popover().within(() => cy.findByText("B_COLUMN").click());

      visualize();

      // check that query worked

      cy.findByTestId("question-table-badges").within(() => {
        cy.findByText("question a");
        cy.findByText("question b");
      });
      cy.findByText("A_COLUMN");
      cy.findByText("Question 5 → B Column");
      cy.findByText("Showing 1 row");
    });

    it("should allow joins based on saved questions (metabase#13000)", () => {
      // pass down a joined question alias
      joinTwoSavedQuestions();
    });

    // NOTE: - This repro is really tightly coupled to the `joinTwoSavedQuestions()` function.
    //       - Be extremely careful when changing any of the steps within that function.
    //       - The alternative approach would have been to write one longer repro instead of two separate ones.
    it("joined questions should create custom column (metabase#13649)", () => {
      // pass down a joined question alias
      joinTwoSavedQuestions();

      // add a custom column on top of the steps from the #13000 repro which was simply asserting
      // that a question could be made by joining two previously saved questions
      cy.icon("add_data").click();

      popover().within(() => {
        enterCustomColumnDetails({
          formula: "[Question 5 → Sum of Rating] / [Sum of Rating]",
        });

        cy.findByPlaceholderText("Something nice and descriptive").type(
          "Sum Divide",
        );

        cy.button("Done").should("not.be.disabled").click();
      });

      visualize();

      cy.findByText("Sum Divide");
    });

    it("should join saved questions that themselves contain joins (metabase#12928)", () => {
      cy.intercept("GET", "/api/table/card__*/query_metadata").as(
        "cardQueryMetadata",
      );

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
      });

      // Join two previously saved questions
      startNewQuestion();
      cy.findByText("Saved Questions").click();

      cy.findByText("12928_Q1").click();
      cy.wait("@cardQueryMetadata");

      cy.icon("join_left_outer").click();

      popover().within(() => {
        cy.findByTextEnsureVisible("Sample Database").click();
        cy.findByTextEnsureVisible("Saved Questions").click();
      });

      cy.findByText("12928_Q2").click();
      cy.wait("@cardQueryMetadata");

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

      cy.findAllByText(/Products? → Category/).should("have.length", 2);
    });

    it("should join saved question with sorted metric (metabase#13744)", () => {
      // create first question based on repro steps in #13744
      cy.createQuestion({
        name: "13744",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
          "order-by": [["asc", ["aggregation", 0]]],
        },
      }).then(({ body: { id: questionId } }) => {
        const ALIAS = `Question ${questionId}`;

        // create new question and join it with a previous one
        cy.createQuestion({
          name: "13744_joined",
          query: {
            joins: [
              {
                alias: ALIAS,
                fields: "all",
                condition: [
                  "=",
                  ["field", PRODUCTS.CATEGORY, null],
                  [
                    "field",
                    "CATEGORY",
                    { "base-type": "type/Text", "join-alias": ALIAS },
                  ],
                ],
                "source-table": `card__${questionId}`,
              },
            ],
            "source-table": PRODUCTS_ID,
          },
        }).then(({ body: { id: joinedQuestionId } }) => {
          // Assert phase begins here
          visitQuestion(joinedQuestionId);

          cy.log("Reported failing on v0.34.3 - v0.37.0.2");
          cy.log("Reported error log: 'No aggregation at index: 0'");

          cy.findByText("13744_joined");
          cy.findAllByText("Gizmo");
        });
      });
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
      cy.contains(/^A closer look at/);
      // Make sure at least one card is rendered
      cy.get(".DashCard");
    });
  });
});

// Extracted repro steps for #13000
function joinTwoSavedQuestions() {
  cy.createQuestion({
    name: "Q1",
    query: {
      aggregation: ["sum", ["field", ORDERS.TOTAL, null]],
      breakout: [["field", ORDERS.PRODUCT_ID, null]],
      "source-table": ORDERS_ID,
    },
  }).then(() => {
    cy.createQuestion({
      name: "Q2",
      query: {
        aggregation: ["sum", ["field", PRODUCTS.RATING, null]],
        breakout: [["field", PRODUCTS.ID, null]],
        "source-table": PRODUCTS_ID,
      },
    }).then(() => {
      cy.intercept("/api/database/1/schema/PUBLIC").as("schema");
      startNewQuestion();

      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText("Q1").click();
      });

      cy.icon("join_left_outer").click();
      cy.wait("@schema");
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
    });
  });
}
