import {
  createNativeQuestion,
  openOrdersTable,
  popover,
  visitQuestionAdhoc,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATASET;

describe("joins", () => {
  it("should allow joins", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();

    // join to Reviews on orders.product_id = reviews.product_id
    cy.icon("join_left_outer").click();
    popover()
      .contains("Reviews")
      .click();
    popover()
      .contains("Product ID")
      .click();
    popover()
      .contains("Product ID")
      .click();

    // get the average rating across all rows (not a useful metric)
    cy.contains("Pick the metric you want to see").click();
    popover()
      .contains("Average of")
      .click();
    popover()
      .find(".Icon-join_left_outer")
      .click();
    popover()
      .contains("Rating")
      .click();
    cy.contains("Visualize").click();
    cy.contains("Orders + Reviews");
    cy.contains("3");
  });

  it("should allow post-join filters (metabase#12221)", () => {
    cy.log("Start a custom question with Orders");
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();

    cy.log("Join to People table using default settings");
    cy.icon("join_left_outer ").click();
    cy.contains("People").click();
    cy.contains("Orders + People");
    cy.contains("Visualize").click();
    cy.contains("Showing first 2,000");

    cy.log("Attempt to filter on the joined table");
    cy.contains("Filter").click();
    cy.contains("Email").click();
    cy.contains("People – Email");
    cy.findByPlaceholderText("Search by Email")
      .type("wo")
      .then($el => {
        // This test was flaking due to a race condition with typing.
        // We're ensuring that the value entered was correct and are retrying if it wasn't
        const value = $el[0].value;
        const input = cy.wrap($el);
        if (value !== "wo") {
          input.clear().type("wo");
        }
      });
    cy.findByText("wolf.dina@yahoo.com").click();
    cy.button("Add filter").click();
    cy.contains("Showing 1 row");
  });

  it("should join on field literals", () => {
    // create two native questions
    createNativeQuestion("question a", "select 'foo' as a_column");
    createNativeQuestion("question b", "select 'foo' as b_column");

    // start a custom question with question a
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("question a").click();

    // join to question b
    cy.icon("join_left_outer").click();
    popover().within(() => {
      cy.findByText("Sample Dataset").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("question b").click();
    });

    // select the join columns
    popover().within(() => cy.findByText("A_COLUMN").click());
    popover().within(() => cy.findByText("B_COLUMN").click());

    cy.button("Visualize").click();
    cy.queryByText("Visualize").then($el => cy.wrap($el).should("not.exist")); // wait for that screen to disappear to avoid "multiple elements" errors

    // check that query worked
    cy.findByText("question a + question b");
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
      cy.get("[contenteditable='true']").type(
        "[Question 5 → sum] / [Sum of Rating]",
      );
      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type("Sum Divide");

      cy.button("Done")
        .should("not.be.disabled")
        .click();
    });
    cy.button("Visualize").click();

    cy.wait("@cardQuery").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });
    cy.findByText("Sum Divide");
  });

  it("should show correct column title with foreign keys (metabase#11452)", () => {
    // (Orders join Reviews on Product ID)
    openOrdersTable();
    cy.icon("notebook").click();
    cy.findByText("Join data").click();
    cy.findByText("Reviews").click();
    cy.findByText("Product ID").click();
    popover().within(() => {
      cy.findByText("Product ID").click();
    });

    cy.log("It shouldn't use FK for a column title");
    cy.findByText("Summarize").click();
    cy.findByText("Pick a column to group by").click();

    // NOTE: Since there is no better way to "get" the element we need, below is a representation of the current DOM structure.
    //       This can also be useful because some future DOM changes could easily introduce a flake.
    //  the common parent
    //    wrapper for the icon
    //      the actual svg icon with the class `.Icon-join_left_outer`
    //    h3.List-section-title with the text content we're actually testing
    popover().within(() => {
      cy.icon("join_left_outer")
        .parent()
        .next()
        // NOTE from Flamber's warning:
        // this name COULD be "normalized" to "Review - Product" instead of "Reviews - Products" - that's why we use Regex match here
        .invoke("text")
        .should("match", /reviews? - products?/i);
    });
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

    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    // Join two previously saved questions
    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("12928_Q1").click();
    cy.icon("join_left_outer").click();
    popover().within(() => {
      cy.findByText("Sample Dataset").click();
      cy.findByText("Saved Questions").click();
    });
    cy.findByText("12928_Q2").click();
    cy.contains(/Products? → Category/).click();
    popover()
      .contains(/Products? → Category/)
      .click();
    cy.button("Visualize").click();

    cy.findByText("12928_Q1 + 12928_Q2");
    cy.log("Reported failing in v1.35.4.1 and `master` on July, 16 2020");
    // TODO: Add a positive assertion once this issue is fixed
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).not.to.exist;
    });
  });

  it.skip("should join saved question with sorted metric (metabase#13744)", () => {
    cy.server();
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
        // listen on the final card query which means the data for this question loaded
        cy.route("POST", `/api/card/${joinedQuestionId}/query`).as("cardQuery");

        // Assert phase begins here
        cy.visit(`/question/${joinedQuestionId}`);
        cy.findByText("13744_joined");

        cy.log("Reported failing on v0.34.3 - v0.37.0.2");
        cy.log("Reported error log: 'No aggregation at index: 0'");
        // assert directly on XHR instead of relying on UI
        cy.wait("@cardQuery").then(xhr => {
          expect(xhr.response.body.error).not.to.exist;
        });
        cy.findAllByText("Gizmo");
      });
    });
  });

  it("should be able to do subsequent aggregation on a custom expression (metabase#14649)", () => {
    cy.createQuestion({
      name: "14649_min",
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.SUBTOTAL, null]],
              { name: "Revenue", "display-name": "Revenue" },
            ],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        aggregation: [
          ["min", ["field", "Revenue", { "base-type": "type/Float" }]],
        ],
      },

      display: "scalar",
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.server();
      cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

      cy.visit(`/question/${QUESTION_ID}`);
      cy.wait("@cardQuery").then(xhr => {
        expect(xhr.response.body.error).to.not.exist;
      });

      cy.findByText("49.54");
    });
  });

  it("x-rays should work on explicit joins when metric is for the joined table (metabase#14793)", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
    cy.route("GET", "/api/automagic-dashboards/adhoc/**").as("xray");

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
        database: 1,
      },
      display: "line",
    });

    cy.wait("@dataset");
    cy.get(".dot")
      .eq(2)
      .click({ force: true });
    cy.findByText("X-ray").click();

    cy.wait("@xray").then(xhr => {
      expect(xhr.response.body.cause).not.to.exist;
      expect(xhr.status).not.to.eq(500);
    });
    // Main title
    cy.contains(/^A closer look at/);
    // Metric title
    cy.findByText("How this metric is distributed across different numbers");
    // Make sure at least one card is rendered
    cy.get(".DashCard");
  });

  it("should handle ad-hoc question with old syntax (metabase#15372)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["=", ["field-id", ORDERS.USER_ID], 1],
        },
        database: 1,
      },
    });

    cy.findByText("User ID is 1");
    cy.findByText("37.65");
  });

  it("breakout binning popover should have normal height even when it's rendered lower on the screen (metabase#15445)", () => {
    cy.visit("/question/1/notebook");
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At")
      .closest(".List-item")
      .findByText("by month")
      .click({ force: true });
    // First a reality check - "Minute" is the only string visible in UI and this should pass
    cy.findAllByText("Minute")
      .first() // TODO: cy.findAllByText(string).first() is necessary workaround that will be needed ONLY until (metabase#15570) gets fixed
      .isVisibleInPopover();
    // The actual check that will fail until this issue gets fixed
    cy.findAllByText("Week")
      .first()
      .isVisibleInPopover();
  });

  it("should add numeric filter on joined table (metabase#15570)", () => {
    cy.createQuestion({
      name: "15570",
      query: {
        "source-table": PRODUCTS_ID,
        joins: [
          {
            fields: "all",
            "source-table": ORDERS_ID,
            condition: [
              "=",
              ["field", PRODUCTS.ID, null],
              ["field", ORDERS.PRODUCT_ID, { "join-alias": "Orders" }],
            ],
            alias: "Orders",
          },
        ],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    cy.findByText("Filter").click();
    popover().within(() => {
      cy.findByText(/Orders/i).click();
      cy.findByText("Discount").click();
    });
    cy.get(".AdminSelect")
      .contains("Equal to")
      .click();
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number").type(0);
    cy.button("Add filter")
      .should("not.be.disabled")
      .click();
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
      cy.intercept("POST", "/api/dataset").as("cardQuery");
      cy.visit(`/question/new`);
      cy.findByText("Custom question").click();

      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText("Q1").click();
      });

      cy.icon("join_left_outer").click();
      popover().within(() => {
        cy.icon("chevronleft").click();
        cy.findByText("Saved Questions").click();
        cy.findByText("Q2").click();
      });

      popover()
        .findByText("Product ID")
        .click();
      popover()
        .findByText("ID")
        .click();

      cy.button("Visualize").click();
      cy.wait("@cardQuery");

      cy.icon("notebook").click();
      cy.url().should("contain", "/notebook");
    });
  });
}
