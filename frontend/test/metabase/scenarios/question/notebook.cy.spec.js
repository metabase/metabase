import {
  createNativeQuestion,
  restore,
  signInAsAdmin,
  openOrdersTable,
  popover,
  modal,
  withSampleDataset,
} from "__support__/cypress";

describe("scenarios > question > notebook", () => {
  before(restore);
  beforeEach(signInAsAdmin);

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
      cy.server();

      withSampleDataset(({ ORDERS, PRODUCTS }) => {
        cy.log("**-- Prepare Question 1 --**");
        cy.request("POST", "/api/card", {
          name: "Q1",
          dataset_query: {
            database: 1,
            query: {
              aggregation: ["sum", ["field-id", ORDERS.TOTAL]],
              breakout: [["field-id", ORDERS.PRODUCT_ID]],
              "source-table": 2,
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
                "source-table": 1,
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
                      alias: "13000",
                      condition: [
                        "=",
                        ["field-literal", "PRODUCT_ID", "type/Integer"],
                        [
                          "joined-field",
                          "13000",
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
      });
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
  });

  describe("nested", () => {
    it("should create a nested question with post-aggregation filter", () => {
      // start a custom question with orders
      cy.visit("/question/new?database=1&table=1&mode=notebook");

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
      cy.visit("/question/new?database=1&table=2&mode=notebook");
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
