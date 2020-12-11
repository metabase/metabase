import {
  createNativeQuestion,
  restore,
  signInAsAdmin,
  openOrdersTable,
  openProductsTable,
  popover,
  modal,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

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

describe("scenarios > question > notebook", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it.skip("shouldn't offer to save the question when there were no changes (metabase#13470)", () => {
    openOrdersTable();
    // save question initially
    cy.findByText("Save").click();
    cy.get(".ModalBody")
      .contains("Save")
      .click();
    cy.findByText("Not now").click();
    // enter "notebook" and visualize without changing anything
    cy.get(".Icon-notebook").click();
    cy.findByText("Visualize").click();

    // there were no changes to the question, so we shouldn't have the option to "Save"
    cy.findByText("Save").should("not.exist");
  });

  it("should allow post-aggregation filters", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();

    // count orders by user id, filter to the one user with 46 orders
    cy.contains("Pick the metric").click();
    popover().within(() => {
      cy.findByText("Count of rows").click();
    });
    cy.contains("Pick a column to group by").click();
    popover().within(() => {
      cy.contains("User ID").click();
    });
    cy.get(".Icon-filter").click();
    popover().within(() => {
      cy.get(".Icon-int").click();
      cy.get("input").type("46");
      cy.contains("Add filter").click();
    });
    cy.contains("Visualize").click();
    cy.contains("2372"); // user's id in the table
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });

  describe("joins", () => {
    it("should allow joins", () => {
      // start a custom question with orders
      cy.visit("/question/new");
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();

      // join to Reviews on orders.product_id = reviews.product_id
      cy.get(".Icon-join_left_outer").click();
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
      cy.log("start a custom question with Orders");
      cy.visit("/question/new");
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();

      cy.log("join to People table using default settings");
      cy.get(".Icon-join_left_outer ").click();
      cy.contains("People").click();
      cy.contains("Orders + People");
      cy.contains("Visualize").click();
      cy.contains("Showing first 2,000");

      cy.log("attempt to filter on the joined table");
      cy.contains("Filter").click();
      cy.contains("Email").click();
      cy.contains("People – Email");
      cy.get('[placeholder="Search by Email"]').type("wolf.");
      cy.contains("wolf.dina@yahoo.com").click();
      cy.contains("Add filter").click();
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
      cy.get(".Icon-join_left_outer").click();
      popover().within(() => {
        cy.findByText("Sample Dataset").click();
        cy.findByText("Saved Questions").click();
        cy.findByText("question b").click();
      });

      // select the join columns
      popover().within(() => cy.findByText("A_COLUMN").click());
      popover().within(() => cy.findByText("B_COLUMN").click());

      cy.findByText("Visualize").click();
      cy.queryByText("Visualize").then($el => cy.wrap($el).should("not.exist")); // wait for that screen to disappear to avoid "multiple elements" errors

      // check that query worked
      cy.findByText("question a + question b");
      cy.findByText("A_COLUMN");
      cy.findByText("Question 5 → B Column");
      cy.findByText("Showing 1 row");
    });

    it("should allow joins based on saved questions (metabase#13000)", () => {
      // pass down a joined question alias
      joinTwoSavedQuestions("13000");
    });

    // NOTE: - This repro is really tightly coupled to the `joinTwoSavedQuestions()` function.
    //       - Be extremely careful when changing any of the steps within that function.
    //       - The alternative approach would have been to write one longer repro instead of two separate ones.
    it.skip("joined questions should create custom column (metabase#13649)", () => {
      // pass down a joined question alias
      joinTwoSavedQuestions("13649");

      // add a custom column on top of the steps from the #13000 repro which was simply asserting
      // that a question could be made by joining two previously saved questions
      cy.findByText("Custom column").click();
      popover().within(() => {
        cy.get("[contenteditable='true']").type(
          // reference joined question by previously set alias
          "[13649 → Sum of Rating] / [Sum of Rating]",
        );
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Sum Divide");

        cy.findAllByRole("button")
          .contains("Done")
          .should("not.be.disabled")
          .click();
      });
      cy.route("POST", "/api/dataset").as("visualization");
      cy.findByText("Visualize").click();

      cy.wait("@visualization").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.findByText("Sum Divide");
    });

    it("should show correct column title with foreign keys (metabase#11452)", () => {
      // (Orders join Reviews on Product ID)
      openOrdersTable();
      cy.get(".Icon-notebook").click();
      cy.findByText("Join data").click();
      cy.findByText("Reviews").click();
      cy.findByText("Product ID").click();
      popover().within(() => {
        cy.findByText("Product ID").click();
      });

      cy.log("**It shouldn't use FK for a column title**");
      cy.findByText("Summarize").click();
      cy.findByText("Pick a column to group by").click();

      // NOTE: Since there is no better way to "get" the element we need, below is a representation of the current DOM structure.
      //       This can also be useful because some future DOM changes could easily introduce a flake.
      //  the common parent
      //    wrapper for the icon
      //      the actual svg icon with the class `.Icon-join_left_outer`
      //    h3.List-section-title with the text content we're actually testing
      popover().within(() => {
        cy.get(".Icon-join_left_outer")
          .parent()
          .next()
          // NOTE from Flamber's warning:
          // this name COULD be "normalized" to "Review - Product" instead of "Reviews - Products" - that's why we use Regex match here
          .invoke("text")
          .should("match", /reviews? - products?/i);
      });
    });

    it.skip("should join saved questions that themselves contain joins (metabase#12928)", () => {
      // Save Question 1
      cy.request("POST", "/api/card", {
        name: "12928_Q1",
        dataset_query: {
          database: 1,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["joined-field", "Products", ["field-id", PRODUCTS.CATEGORY]],
              ["joined-field", "People - User", ["field-id", PEOPLE.SOURCE]],
            ],
            joins: [
              {
                alias: "Products",
                condition: [
                  "=",
                  ["field-id", ORDERS.PRODUCT_ID],
                  ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
                ],
                fields: "all",
                "source-table": PRODUCTS_ID,
              },
              {
                alias: "People - User",
                condition: [
                  "=",
                  ["field-id", ORDERS.USER_ID],
                  ["joined-field", "People - User", ["field-id", PEOPLE.ID]],
                ],
                fields: "all",
                "source-table": PEOPLE_ID,
              },
            ],
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      });

      // Save Question 2
      cy.request("POST", "/api/card", {
        name: "12928_Q2",
        dataset_query: {
          database: 1,
          query: {
            "source-table": REVIEWS_ID,
            aggregation: [["avg", ["field-id", REVIEWS.RATING]]],
            breakout: [
              ["joined-field", "Products", ["field-id", PRODUCTS.CATEGORY]],
            ],
            joins: [
              {
                alias: "Products",
                condition: [
                  "=",
                  ["field-id", REVIEWS.PRODUCT_ID],
                  ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
                ],
                fields: "all",
                "source-table": PRODUCTS_ID,
              },
            ],
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      });

      // Join two previously saved questions
      cy.visit("/");
      cy.findByText("Ask a question").click();
      cy.findByText("Custom question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("12928_Q1").click();
      cy.get(".Icon-join_left_outer").click();
      popover().within(() => {
        cy.findByText("Sample Dataset").click();
        cy.findByText("Saved Questions").click();
      });
      cy.findByText("12928_Q2").click();
      cy.contains(/Products? → Category/).click();
      popover()
        .contains(/Products? → Category/)
        .click();
      cy.findByText("Visualize").click();

      cy.log("**Reported failing in v1.35.4.1 and `master` on July, 16 2020**");
      cy.findByText("12928_Q1 + 12928_Q2");
      // TODO: Add a positive assertion once this issue is fixed
      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
    });

    it.skip("should join saved question with sorted metric (metabase#13744)", () => {
      cy.server();
      // create first question based on repro steps in #13744

      cy.request("POST", "/api/card", {
        name: "13744",
        dataset_query: {
          database: 1,
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [["field-id", PRODUCTS.CATEGORY]],
            "order-by": [["asc", ["aggregation", 0]]],
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: questionId } }) => {
        const ALIAS = `Question ${questionId}`;

        // create new question and join it with a previous one
        cy.request("POST", "/api/card", {
          name: "13744_joined",
          dataset_query: {
            database: 1,
            query: {
              joins: [
                {
                  alias: ALIAS,
                  fields: "all",
                  condition: [
                    "=",
                    ["field-id", PRODUCTS.CATEGORY],
                    [
                      "joined-field",
                      ALIAS,
                      ["field-literal", "CATEGORY", "type/Text"],
                    ],
                  ],
                  "source-table": `card__${questionId}`,
                },
              ],
              "source-table": PRODUCTS_ID,
            },
            type: "query",
          },
          display: "table",
          visualization_settings: {},
        }).then(({ body: { id: joinedQuestionId } }) => {
          // listen on the final card query which means the data for this question loaded
          cy.route("POST", `/api/card/${joinedQuestionId}/query`).as(
            "cardQuery",
          );

          // Assert phase begins here
          cy.visit(`/question/${joinedQuestionId}`);
          cy.findByText("13744_joined");

          cy.log("**Reported failing on v0.34.3 - v0.37.0.2**");
          cy.log("**Reported error log: 'No aggregation at index: 0'**");
          // assert directly on XHR instead of relying on UI
          cy.wait("@cardQuery").then(xhr => {
            expect(xhr.response.body.error).not.to.exist;
          });
          cy.findAllByText("Gizmo");
        });
      });
    });
  });

  describe("nested", () => {
    it("should create a nested question with post-aggregation filter", () => {
      openProductsTable({ mode: "notebook" });

      cy.findByText("Summarize").click();
      popover().within(() => {
        cy.findByText("Count of rows").click();
      });

      cy.findByText("Pick a column to group by").click();
      popover().within(() => {
        cy.findByText("Category").click();
      });

      cy.findByText("Filter").click();
      popover().within(() => {
        cy.findByText("Category").click();
        cy.findByText("Gadget").click();
        cy.findByText("Add filter").click();
      });

      cy.findByText("Visualize").click();
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("not.exist");

      cy.findByText("Save").click();

      modal().within(() => {
        cy.findByLabelText("Name").type("post aggregation");
        cy.findByText("Save").click();
      });

      cy.findByText("Not now").click();

      cy.get(".Icon-notebook").click();

      cy.reload();

      cy.findByText("Category").should("exist");
      cy.findByText("Category is Gadget").should("exist");
    });
  });

  // TODO: add positive assertions to all 4 tests when we figure out implementation details
  describe.skip("arithmetic (metabase#13175)", () => {
    beforeEach(() => {
      openOrdersTable({ mode: "notebook" });
    });

    it("should work on custom column with `case`", () => {
      cy.get(".Icon-add_data").click();
      cy.get("[contenteditable='true']")
        .click()
        .clear()
        .type("case([Subtotal] + Tax > 100, 'Big', 'Small')", { delay: 50 });
      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type("Example", { delay: 100 });

      cy.findAllByRole("button")
        .contains("Done")
        .should("not.be.disabled");
    });

    it("should work on custom filter", () => {
      cy.findByText("Filter").click();
      cy.findByText("Custom Expression").click();

      cy.get("[contenteditable='true']")
        .click()
        .clear()
        .type("[Subtotal] - Tax > 20", { delay: 50 });

      cy.findAllByRole("button")
        .contains("Done")
        .should("not.be.disabled")
        .click();

      cy.contains(/^redundant input/i).should("not.exist");
    });

    const CASES = {
      CountIf: "CountIf(([Subtotal] + [Tax]) > 10)",
      SumIf: "SumIf([Subtotal], ([Subtotal] + [Tax] > 20))",
    };

    Object.entries(CASES).forEach(([filter, formula]) => {
      it(`should work on custom aggregation with ${filter}`, () => {
        cy.findByText("Summarize").click();
        cy.findByText("Custom Expression").click();

        cy.get("[contenteditable='true']")
          .click()
          .clear()
          .type(formula, { delay: 50 });

        cy.findByPlaceholderText("Name (required)")
          .click()
          .type("Ex", { delay: 100 });

        cy.contains(/^expected closing parenthesis/i).should("not.exist");
        cy.contains(/^redundant input/i).should("not.exist");
      });
    });
  });
});

// Extracted repro steps for #13000
function joinTwoSavedQuestions(ALIAS = "Joined Question") {
  cy.server();

  cy.log("**-- Prepare Question 1 --**");
  cy.request("POST", "/api/card", {
    name: "Q1",
    dataset_query: {
      database: 1,
      query: {
        aggregation: ["sum", ["field-id", ORDERS.TOTAL]],
        breakout: [["field-id", ORDERS.PRODUCT_ID]],
        "source-table": ORDERS_ID,
      },
      type: "query",
    },
    display: "table",
    visualization_settings: {},
  }).then(({ body: { id: Q1_ID } }) => {
    cy.log("**-- Prepare Question 2 --**");
    cy.request("POST", "/api/card", {
      name: "Q2",
      dataset_query: {
        database: 1,
        query: {
          aggregation: ["sum", ["field-id", PRODUCTS.RATING]],
          breakout: [["field-id", PRODUCTS.ID]],
          "source-table": PRODUCTS_ID,
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: Q2_ID } }) => {
      cy.log(
        "**-- Create Question 3 based on 2 previously saved questions --**",
      );
      cy.request("POST", "/api/card", {
        name: "Q3",
        dataset_query: {
          database: 1,
          query: {
            joins: [
              {
                alias: ALIAS,
                condition: [
                  "=",
                  ["field-literal", "PRODUCT_ID", "type/Integer"],
                  [
                    "joined-field",
                    ALIAS,
                    ["field-literal", "ID", "type/BigInteger"],
                  ],
                ],
                fields: "all",
                "source-table": `card__${Q2_ID}`,
              },
            ],
            "source-table": `card__${Q1_ID}`,
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: Q3_ID } }) => {
        cy.route("POST", `/api/card/${Q3_ID}/query`).as("cardQuery");
        cy.visit(`/question/${Q3_ID}`);

        cy.wait("@cardQuery");

        cy.log("**Reported in v0.36.0**");
        cy.get(".Icon-notebook").click();
        cy.url().should("contain", "/notebook");
        cy.findByText("Visualize").should("exist");
      });
    });
  });
}
