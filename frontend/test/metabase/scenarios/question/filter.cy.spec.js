import {
  restore,
  openOrdersTable,
  openProductsTable,
  openReviewsTable,
  openPeopleTable,
  popover,
  filterWidget,
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

describe("scenarios > question > filter", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("dashboard filter dropdown/search (metabase#12985)", () => {
    it("Repro 1: should work for saved nested questions", () => {
      cy.createQuestion({
        name: "Q1",
        query: { "source-table": PRODUCTS_ID },
      }).then(({ body: { id: Q1_ID } }) => {
        // Create nested card based on the first one
        cy.createQuestion({
          name: "Q2",
          query: { "source-table": `card__${Q1_ID}` },
        }).then(({ body: { id: Q2_ID } }) => {
          cy.createDashboard("12985D").then(
            ({ body: { id: DASHBOARD_ID } }) => {
              cy.log("Add 2 filters to the dashboard");

              cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
                parameters: [
                  {
                    name: "Date Filter",
                    slug: "date_filter",
                    id: "78d4ba0b",
                    type: "date/all-options",
                  },
                  {
                    name: "Category",
                    slug: "category",
                    id: "20976cce",
                    type: "category",
                  },
                ],
              });

              cy.log("Add nested card to the dashboard");

              cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                cardId: Q2_ID,
              }).then(({ body: { id: DASH_CARD_ID } }) => {
                cy.log("Connect dashboard filters to the nested card");

                cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                  cards: [
                    {
                      id: DASH_CARD_ID,
                      card_id: Q2_ID,
                      row: 0,
                      col: 0,
                      sizeX: 10,
                      sizeY: 8,
                      series: [],
                      visualization_settings: {},
                      // Connect both filters and to the card
                      parameter_mappings: [
                        {
                          parameter_id: "78d4ba0b",
                          card_id: Q2_ID,
                          target: [
                            "dimension",
                            ["field", PRODUCTS.CREATED_AT, null],
                          ],
                        },
                        {
                          parameter_id: "20976cce",
                          card_id: Q2_ID,
                          target: [
                            "dimension",
                            ["field", PRODUCTS.CATEGORY, null],
                          ],
                        },
                      ],
                    },
                  ],
                });
              });
              cy.visit(`/dashboard/${DASHBOARD_ID}`);
            },
          );
        });
      });

      filterWidget()
        .last()
        .within(() => {
          cy.findByText("Category").click();
        });
      cy.log("Failing to show dropdown in v0.36.0 through v.0.37.0");
      popover()
        .contains("Gadget")
        .click();
      cy.findByText("Add filter").click();
      cy.url().should("contain", "?category=Gadget");
      cy.findByText("Ergonomic Silk Coat");
    });

    it.skip("Repro 2: should work for aggregated questions", () => {
      cy.createQuestion({
        name: "12985-v2",
        query: {
          "source-query": {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [["field", PRODUCTS.CATEGORY, null]],
          },
          filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1],
        },
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.createDashboard("12985-v2D").then(
          ({ body: { id: DASHBOARD_ID } }) => {
            cy.log("Add a category filter to the dashboard");

            cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
              parameters: [
                {
                  name: "Category",
                  slug: "category",
                  id: "7c4htcv8",
                  type: "category",
                },
              ],
            });

            cy.log("Add previously created question to the dashboard");

            cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cardId: QUESTION_ID,
            }).then(({ body: { id: DASH_CARD_ID } }) => {
              cy.log("Connect dashboard filter to the aggregated card");

              cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
                cards: [
                  {
                    id: DASH_CARD_ID,
                    card_id: QUESTION_ID,
                    row: 0,
                    col: 0,
                    sizeX: 8,
                    sizeY: 6,
                    series: [],
                    visualization_settings: {},
                    // Connect filter to the card
                    parameter_mappings: [
                      {
                        parameter_id: "7c4htcv8",
                        card_id: QUESTION_ID,
                        target: [
                          "dimension",
                          ["field", "CATEGORY", { "base-type": "type/Text" }],
                        ],
                      },
                    ],
                  },
                ],
              });
            });
            cy.visit(`/dashboard/${DASHBOARD_ID}`);
          },
        );
      });

      cy.findByPlaceholderText("Category").click();
      // It will fail at this point until the issue is fixed because popover never appears
      popover()
        .contains("Gadget")
        .click();
      cy.findByText("Add filter").click();
      cy.url().should("contain", "?category=Gadget");
      cy.findByText("Ergonomic Silk Coat");
    });
  });

  it("should filter a joined table by 'Is not' filter (metabase#13534)", () => {
    // NOTE: the original issue mentions "Is not" and "Does not contain" filters
    // we're testing for one filter only to keep things simple

    openOrdersTable({ mode: "notebook" });
    // join with Products
    cy.findByText("Join data").click();
    cy.findByText("Products").click();
    // add filter
    cy.findByText("Filter").click();
    popover().within(() => {
      // we've run into weird "name normalization" issue
      // where it displays "Product" locally, and "Products" in CI
      // also, we need to eliminate "Product ID" - that's why I used `$`
      cy.contains(/products?$/i).click();
    });
    cy.findByText("Category").click();
    cy.findByText("Is").click();
    cy.findByText("Is not").click();
    cy.findByText("Gizmo").click();
    cy.findByText("Add filter").click();
    cy.contains("Category is not Gizmo");

    cy.button("Visualize").click();
    // wait for results to load
    cy.get(".LoadingSpinner").should("not.exist");
    cy.log("The point of failure in 0.37.0-rc3");
    cy.contains("37.65");
    cy.findByText("There was a problem with your question").should("not.exist");
    // this is not the point of this repro, but additionally make sure the filter is working as intended on "Gizmo"
    cy.findByText("3621077291879").should("not.exist"); // one of the "Gizmo" EANs
  });

  it("'Between Dates' filter should behave consistently (metabase#12872)", () => {
    cy.createQuestion({
      name: "12872",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        filter: [
          "and",
          [
            "between",
            ["field", PRODUCTS.CREATED_AT, null],
            "2019-04-15",
            "2019-04-15",
          ],
          [
            "between",
            ["field", PRODUCTS.CREATED_AT, { "join-alias": "Products" }],
            "2019-04-15",
            "2019-04-15",
          ],
        ],
        joins: [
          {
            alias: "Products",
            condition: [
              "=",
              ["field", PRODUCTS.ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            fields: "all",
            "source-table": PRODUCTS_ID,
          },
        ],
      },
      display: "scalar",
    }).then(({ body: { id: questionId } }) => {
      cy.visit(`/question/${questionId}`);
      cy.findByText("12872");
      cy.log("At the moment of unfixed issue, it's showing '0'");
      cy.get(".ScalarValue").contains("1");
    });
  });

  it.skip("should filter based on remapped values (metabase#13235)", () => {
    // set "Filtering on this field" = "A list of all values"
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    // "Display values" = "Use foreign key" as `Product.Title`
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    // Add filter as remapped Product ID (Product name)
    openOrdersTable();
    cy.findByText("Filter").click();
    cy.get(".List-item-title")
      .contains("Product ID")
      .click();
    cy.get(".scroll-y")
      .contains("Aerodynamic Linen Coat")
      .click();
    cy.findByText("Add filter").click();

    cy.log("Reported failing on v0.36.4 and v0.36.5.1");
    cy.get(".LoadingSpinner").should("not.exist");
    cy.findAllByText("148.23"); // one of the subtotals for this product
    cy.findAllByText("Fantastic Wool Shirt").should("not.exist");
  });

  it("should filter using Custom Expression from aggregated results (metabase#12839)", () => {
    const CE_NAME = "Simple Math";

    cy.createQuestion({
      name: "12839",
      query: {
        filter: [">", ["field", CE_NAME, { "base-type": "type/Float" }], 0],
        "source-query": {
          aggregation: [
            [
              "aggregation-options",
              ["+", 1, 1],
              { name: CE_NAME, "display-name": CE_NAME },
            ],
          ],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
          "source-table": PRODUCTS_ID,
        },
      },
    }).then(({ body: { id: questionId } }) => {
      cy.server();
      cy.route("POST", `/api/card/${questionId}/query`).as("cardQuery");

      cy.visit(`/question/${questionId}`);
      cy.wait("@cardQuery");

      cy.log("Reported failing on v0.35.4");
      cy.log(`Error message: **Column 'source.${CE_NAME}' not found;**`);
      cy.findAllByText("Gizmo");
    });
  });

  it.skip("should not preserve cleared filter with the default value on refresh (metabase#13960)", () => {
    cy.log("Create a question");
    cy.createQuestion({
      name: "13960",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "pie",
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.createDashboard("13960D").then(({ body: { id: DASHBOARD_ID } }) => {
        cy.log(
          "Add filters to the dashboard and set the default value to the first one",
        );

        cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}`, {
          name: "13960D",
          parameters: [
            {
              name: "Category",
              slug: "category",
              id: "c32a49e1",
              type: "category",
              default: ["Doohickey"],
            },
            { name: "ID", slug: "id", id: "f2bf003c", type: "id" },
          ],
        });

        cy.log("Add question to the dashboard");

        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          cy.log("Connect the filters to the card");

          cy.request("PUT", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cards: [
              {
                id: DASH_CARD_ID,
                card_id: QUESTION_ID,
                row: 0,
                col: 0,
                sizeX: 10,
                sizeY: 10,
                series: [],
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: "c32a49e1",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                  {
                    parameter_id: "f2bf003c",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field", PRODUCTS.ID, null]],
                  },
                ],
              },
            ],
          });
        });
        cy.server();
        cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

        cy.visit(`/dashboard/${DASHBOARD_ID}`);

        cy.wait("@cardQuery");
        cy.location("search").should("eq", "?category=Doohickey");

        // Remove default filter (category)
        cy.get("fieldset .Icon-close").click();

        cy.url().should("not.include", "?category=Doohickey");

        // Set filter value to the `ID`
        filterWidget()
          .contains(/ID/i)
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1");
        cy.findByText("Add filter")
          .closest("button")
          .should("not.be.disabled")
          .click();

        cy.location("search").should("eq", "?id=1");

        cy.reload();

        cy.findByText("13960");
        cy.findAllByText("Doohickey").should("not.exist");
        // TODO: depending on how this issue will be fixed, the next assertion might need to be updated
        cy.location("search").should("eq", "?id=1");
      });
    });
  });

  it.skip("should not drop aggregated filters (metabase#11957)", () => {
    const AGGREGATED_FILTER = "Count is less than or equal to 20";

    cy.createQuestion({
      name: "11957",
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          filter: [">", ["field", ORDERS.CREATED_AT, null], "2020-01-01"],
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        },
        filter: ["<=", ["field", "count", { "base-type": "type/Integer" }], 20],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
    });

    // Test shows two filter collapsed - click on number 2 to expand and show filter names
    cy.icon("filter")
      .parent()
      .contains("2")
      .click();

    cy.findByText(AGGREGATED_FILTER);

    cy.findByText(/^Created At is after/i)
      .parent()
      .find(".Icon-close")
      .click();

    cy.log(
      "**Removing or changing filters shouldn't remove aggregated filter**",
    );
    cy.findByText(AGGREGATED_FILTER);
  });

  it("in a simple question should display popup for custom expression options (metabase#14341) (metabase#15244)", () => {
    openProductsTable();
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();

    // This issue has two problematic parts. We're testing for both:
    cy.log("Popover should display all custom expression options");
    // Popover shows up even without explicitly clicking the contenteditable field
    popover().within(() => {
      cy.findAllByRole("listitem").contains(/functions/i);
    });

    cy.log("Should not display error prematurely");
    cy.get("[contenteditable='true']")
      .click()
      .type("contains(");
    cy.findByText(/Checks to see if string1 contains string2 within it./i);
    cy.button("Done").should("not.be.disabled");
    cy.get(".text-error").should("not.exist");
    cy.findAllByText(/Expected one of these possible Token sequences:/i).should(
      "not.exist",
    );
  });

  it("should be able to add date filter with calendar collapsed (metabase#14327)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Created At").click();
    cy.findByText("Previous").click();
    cy.findByText("Before").click();
    // Collapse the calendar view
    cy.icon("calendar").click();
    cy.findByText("Add filter")
      .closest(".Button")
      .should("not.be.disabled")
      .click();
    cy.findByText(/^Created At is before/i);
  });

  it("should display original custom expression filter with dates on subsequent click (metabase#12492)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: [
            ">",
            ["field", ORDERS.CREATED_AT, null],
            [
              "field",
              PRODUCTS.CREATED_AT,
              { "source-field": ORDERS.PRODUCT_ID },
            ],
          ],
        },
        database: 1,
      },
      display: "table",
    });

    cy.wait("@dataset");
    cy.findByText(/Created At > Product? → Created At/i).click();
    cy.get("[contenteditable='true']").contains(
      /\[Created At\] > \[Products? → Created At\]/,
    );
  });

  it("should handle post-aggregation filter on questions with joined table (metabase#14811)", () => {
    cy.createQuestion({
      name: "14811",
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "sum",
              ["field", PRODUCTS.PRICE, { "source-field": ORDERS.PRODUCT_ID }],
            ],
          ],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        filter: [
          "=",
          ["field", "CATEGORY", { "base-type": "type/Text" }],
          "Widget",
        ],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.server();
      cy.route("POST", `/api/card/${QUESTION_ID}/query`).as("cardQuery");

      cy.visit(`/question/${QUESTION_ID}`);

      cy.wait("@cardQuery").then(xhr => {
        expect(xhr.response.body.error).not.to.exist;
      });
      cy.get(".cellData").contains("Widget");
      cy.findByText("Showing 1 row");
    });
  });

  it("should offer case expression in the auto-complete suggestions", () => {
    openExpressionEditorFromFreshlyLoadedPage();

    popover().contains(/case/i);

    typeInExpressionEditor("c");

    // "case" is still there after typing a bit
    popover().contains(/case/i);
  });

  it("should enable highlighting suggestions with keyboard up and down arrows (metabase#16210)", () => {
    const transparent = "rgba(0, 0, 0, 0)";

    openExpressionEditorFromFreshlyLoadedPage();

    typeInExpressionEditor("c");

    cy.contains("Created At")
      .closest("li")
      .should("have.css", "background-color")
      .and("not.eq", transparent);

    typeInExpressionEditor("{downarrow}");

    cy.contains("Created At")
      .closest("li")
      .should("have.css", "background-color")
      .and("eq", transparent);

    cy.contains("Product → Category")
      .closest("li")
      .should("have.css", "background-color")
      .and("not.eq", transparent);
  });

  it.skip("should provide accurate auto-complete custom-expression suggestions based on the aggregated column name (metabase#14776)", () => {
    cy.viewport(1400, 1000); // We need a bit taller window for this repro to see all custom filter options in the popover
    cy.createQuestion({
      name: "14776",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']")
      .as("inputField")
      .click()
      .type("su");
    popover().contains(/Sum of Total/i);
    cy.get("@inputField")
      .click()
      .type("m");
    popover().contains(/Sum of Total/i);
  });

  it("should correctly filter custom column by 'Not equal to' (metabase#14843)", () => {
    const CC_NAME = "City Length";

    cy.server();
    cy.route("POST", "/api/card/*/query").as("cardQuery");

    cy.createQuestion({
      name: "14843",
      query: {
        "source-table": PEOPLE_ID,
        expressions: { [CC_NAME]: ["length", ["field", PEOPLE.CITY, null]] },
        filter: ["!=", ["expression", CC_NAME], 3],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
    });
    cy.wait("@cardQuery");
    cy.findByText("Rye").should("not.exist");
  });

  it("should filter using IsNull() and IsEmpty()", () => {
    openReviewsTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();

    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("NOT IsNull([Rating])", { delay: 50 });
    cy.button("Done")
      .should("not.be.disabled")
      .click();

    cy.get(".QueryBuilder .Icon-add").click();

    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("NOT IsEmpty([Reviewer])", { delay: 50 });
    cy.button("Done")
      .should("not.be.disabled")
      .click();

    // check that filter is applied and rows displayed
    cy.button("Visualize").click();
    cy.contains("Showing 1,112 rows");
  });

  it("should convert 'is empty' on a text column to a custom expression using IsEmpty()", () => {
    openReviewsTable();
    cy.contains("Reviewer").click();
    cy.findByText("Filter by this column").click();
    cy.findByText("Is").click();
    cy.findByText("Is empty").click();
    cy.findByText("Update filter").click();

    // filter out everything
    cy.contains("Showing 0 rows");

    // change the corresponding custom expression
    cy.findByText("Reviewer is empty").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']").contains("isempty([Reviewer])");
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("NOT IsEmpty([Reviewer])", { delay: 50 });
    cy.findByText("Done").click();
    cy.contains("Showing 1,112 rows");
  });

  it("should convert 'is empty' on a numeric column to a custom expression using IsNull()", () => {
    openReviewsTable();
    cy.contains("Rating").click();
    cy.findByText("Filter by this column").click();
    cy.findByText("Equal to").click();
    cy.findByText("Is empty").click();
    cy.findByText("Update filter").click();

    // filter out everything
    cy.contains("Showing 0 rows");

    // change the corresponding custom expression
    cy.findByText("Rating is empty").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']").contains("isnull([Rating])");
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("NOT IsNull([Rating])", { delay: 50 });
    cy.findByText("Done").click();
    cy.contains("Showing 1,112 rows");
  });

  it("should convert negative filter to custom expression (metabase#14880)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          filter: [
            "does-not-contain",
            ["field", PRODUCTS.TITLE, null],
            "Wallet",
            { "case-sensitive": false },
          ],
        },
        database: 1,
      },
      display: "table",
    });
    cy.findByText("Title does not contain Wallet").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']").contains(
      'NOT contains([Title], "Wallet")',
    );
  });

  it.skip("shuld convert negative filter to custom expression (metabase#14880)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          filter: [
            "does-not-contain",
            ["field", PRODUCTS.TITLE, null],
            "Wallet",
            { "case-sensitive": false },
          ],
        },
        database: 1,
      },
      display: "table",
    });
    cy.findByText("Title does not contain Wallet").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    // Before we implement this feature, we can only assert that the input field for custom expression doesn't show at all
    cy.get("[contenteditable='true']");
  });

  it.skip("should be able to convert case-insensitive filter to custom expression (metabase#14959)", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          filter: [
            "contains",
            ["field", REVIEWS.REVIEWER, null],
            "MULLER",
            { "case-sensitive": false },
          ],
        },
        database: 1,
      },
      display: "table",
    });
    cy.wait("@dataset");
    cy.findByText("wilma-muller");
    cy.findByText("Reviewer contains MULLER").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']").contains(
      'contains([Reviewer], "MULLER")',
    );
    cy.button("Done").click();
    cy.wait("@dataset.2").then(xhr => {
      expect(xhr.response.body.data.rows).to.have.lengthOf(1);
    });
    cy.findByText("wilma-muller");
  });

  it("should reject a number literal", () => {
    openProductsTable();
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();

    cy.get("[contenteditable='true']")
      .click()
      .type("3.14159");
    cy.button("Done")
      .should("not.be.disabled")
      .click();
    cy.findByText("Expecting boolean but found 3.14159");
  });

  it("should reject a string literal", () => {
    openProductsTable();
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();

    cy.get("[contenteditable='true']")
      .click()
      .type('"TheAnswer"');
    cy.button("Done")
      .should("not.be.disabled")
      .click();
    cy.findByText('Expecting boolean but found "TheAnswer"');
  });

  it.skip("column filters should work for metrics (metabase#15333)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field-id", PRODUCTS.CATEGORY]],
        },
        database: 1,
      },
      display: "table",
    });

    cy.get(".cellData")
      .contains("Count")
      .click();
    cy.findByText("Filter by this column").click();
    cy.findByPlaceholderText("Enter a number").type("42");
    cy.button("Update filter")
      .should("not.be.disabled")
      .click();
    cy.findByText("Doohickey");
    cy.findByText("Gizmo").should("not.exist");
  });

  it("custom expression filter should reference fields by their name, not by their id (metabase#15748)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable=true]").type("[Total] < [Subtotal]");
    cy.button("Done").click();
    cy.findByText("Total < Subtotal");
  });

  it("custom expression filter should allow the use of parentheses in combination with logical operators (metabase#15754)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable=true]")
      .type("([ID] > 2 OR [Subtotal] = 100) and [Tax] < 4")
      .blur();
    cy.findByText(/^Expected closing parenthesis but found/).should(
      "not.exist",
    );
    cy.button("Done").should("not.be.disabled");
  });

  it.skip("custom expression filter should work with numeric value before an operator (metabase#15893)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    openOrdersTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable=true]")
      .type("0 < [ID]")
      .blur();
    cy.button("Done").click();
    cy.button("Visualize").click();
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.error).to.not.exist;
    });
  });

  it.skip("should work on twice summarized questions (metabase#15620)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-query": {
            "source-table": 1,
            aggregation: [["count"]],
            breakout: [["field", 7, { "temporal-unit": "month" }]],
          },
          aggregation: [
            ["avg", ["field", "count", { "base-type": "type/Integer" }]],
          ],
        },
        type: "query",
      },
    });
    cy.get(".ScalarValue").contains("5");
    cy.findAllByRole("button")
      .contains("Filter")
      .click();
    cy.findByTestId("sidebar-right").within(() => {
      cy.findByText("Category").click();
      cy.findByText("Gizmo").click();
    });
    cy.button("Add filter")
      .should("not.be.disabled")
      .click();
    cy.get(".dot");
  });

  it("user shouldn't need to scroll to add filter (metabase#14307)", () => {
    cy.viewport(1280, 720);
    openPeopleTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    popover()
      .findByText("State")
      .click();
    cy.findByText("AL").click();
    cy.button("Add filter").isVisibleInPopover();
  });

  it.skip("shoud retain all data series after saving a question where custom expression formula is the first metric (metabase#15882)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              [
                "/",
                ["sum", ["field", ORDERS.DISCOUNT, null]],
                ["sum", ["field", ORDERS.SUBTOTAL, null]],
              ],
              { "display-name": "Discount %" },
            ],
            ["count"],
            ["avg", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        type: "query",
      },
      display: "line",
    });
    assertOnLegendLabels();
    cy.get(".line").should("have.length", 3);
    cy.findByText("Save").click();
    cy.button("Save").click();
    cy.button("Not now").click();
    assertOnLegendLabels();
    cy.get(".line").should("have.length", 3);

    function assertOnLegendLabels() {
      cy.get(".Card-title")
        .should("contain", "Discount %")
        .and("contain", "Count")
        .and("contain", "Average of Total");
    }
  });

  describe("specific combination of filters can cause frontend reload or blank screen (metabase#16198)", () => {
    it("shouldn't display chosen category in a breadcrumb (metabase#16198-1)", () => {
      visitQuestionAdhoc({
        dataset_query: {
          database: 1,
          query: {
            "source-table": PRODUCTS_ID,
            filter: [
              "and",
              ["=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"],
              ["=", ["field", PRODUCTS.ID, null], 1],
            ],
          },
          type: "query",
        },
      });
    });

    it("adding an ID filter shouldn't cause page error and page reload (metabase#16198-2)", () => {
      openOrdersTable({ mode: "notebook" });
      cy.findByText("Filter").click();
      cy.findByText("Custom Expression").click();
      cy.get("[contenteditable=true]")
        .type("[Total] < [Product → Price]")
        .blur();
      cy.button("Done").click();
      // Filter currently says "Total is less than..." but it can change in https://github.com/metabase/metabase/pull/16174 to "Total < Price"
      // See: https://github.com/metabase/metabase/pull/16209#discussion_r638129099
      cy.findByText(/^Total/);
      cy.icon("add")
        .last()
        .click();
      popover()
        .findByText(/^ID$/i)
        .click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
      cy.findByText(/^Total/);
      cy.findByText("Something went wrong").should("not.exist");
    });

    it("removing first filter in a sequence shouldn't result in an empty page (metabase#16198-3)", () => {
      openOrdersTable({ mode: "notebook" });
      cy.findByText("Filter").click();
      popover()
        .findByText("Total")
        .click();
      cy.findByPlaceholderText("Enter a number").type("123");
      cy.button("Add filter").click();
      cy.icon("add")
        .last()
        .click();
      cy.findByText("Custom Expression").click();
      cy.get("[contenteditable=true]")
        .type("[Total] < [Product → Price]")
        .blur();
      cy.button("Done").click();
      // cy.findByText(/^Total/);
      cy.icon("add")
        .last()
        .click();
      popover()
        .findByText(/^ID$/i)
        .click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
      cy.findByText("Total is equal to 123")
        .parent()
        .find(".Icon-close")
        .click();
      cy.button("Visualize");
    });
  });

  ["true", "false"].forEach(condition => {
    const regexCondition = new RegExp(`${condition}`, "i");
    // We must use and return strings instead of boolean and numbers
    const integerAssociatedWithCondition = condition === "true" ? "0" : "1";

    describe(`should be able to filter on the boolean column ${condition.toUpperCase()} (metabase#16386)`, () => {
      beforeEach(() => {
        cy.createNativeQuestion({
          name: "16386",
          native: {
            query:
              'select 0::integer as "integer", true::boolean AS "boolean" union all \nselect 1::integer as "integer", false::boolean AS "boolean" union all \nselect null as "integer", true::boolean AS "boolean" union all \nselect -1::integer as "integer", null AS "boolean"',
          },
          visualization_settings: {
            "table.pivot_column": "boolean",
            "table.cell_column": "integer",
          },
        }).then(({ body: { id: QUESTION_ID } }) => {
          cy.visit(`/question/${QUESTION_ID}`);
          cy.findByText("Explore results").click();
        });
      });

      it("from the column popover (metabase#16386-1)", () => {
        cy.get(".cellData")
          .contains("boolean")
          .click();

        popover()
          .findByText("Filter by this column")
          .click();

        popover().within(() => {
          // Not sure exactly what this popover will look like when this issue is fixed.
          // In one of the previous versions it said "Update filter" instead of "Add filter".
          // If that's the case after the fix, this part of the test might need to be updated accordingly.
          cy.button(regexCondition)
            .click()
            .should("have.class", "bg-purple");
          cy.button("Update filter").click();
        });

        assertOnTheResult();
      });

      it("from the simple question (metabase#16386-2)", () => {
        cy.findAllByRole("button")
          .contains("Filter")
          .click();

        cy.findByTestId("sidebar-right").within(() => {
          cy.findByText("boolean").click();
          addBooleanFilter();
        });

        assertOnTheResult();
      });

      it("from the custom question (metabase#16386-3)", () => {
        cy.icon("notebook").click();
        cy.findByText("Filter").click();

        popover().within(() => {
          cy.findByText("boolean").click();
          addBooleanFilter();
        });

        cy.button("Visualize").click();

        assertOnTheResult();
      });

      function addBooleanFilter() {
        // This is really inconvenient way to ensure that the element is selected, but it's the only one currently
        cy.button(regexCondition)
          .click()
          .should("have.class", "bg-purple");
        cy.button("Add filter").click();
      }

      function assertOnTheResult() {
        // Filter name
        cy.findByText(`boolean is ${condition}`);
        cy.findByText(integerAssociatedWithCondition);
      }
    });
  });
});

function openExpressionEditorFromFreshlyLoadedPage() {
  openReviewsTable({ mode: "notebook" });
  cy.findByText("Filter").click();
  cy.findByText("Custom Expression").click();
}

function typeInExpressionEditor(string) {
  cy.get("[contenteditable='true']")
    .click()
    .type(string);
}
