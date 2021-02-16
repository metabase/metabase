import {
  signInAsAdmin,
  restore,
  openOrdersTable,
  openProductsTable,
  popover,
  visitQuestionAdhoc,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATASET;

describe("scenarios > question > filter", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  describe("dashboard filter dropdown/search (metabase#12985)", () => {
    it("Repro 1: should work for saved nested questions", () => {
      cy.log("**-- 1. Create base card --**");

      cy.request("POST", "/api/card", {
        name: "Q1",
        dataset_query: {
          database: 1,
          query: { "source-table": PRODUCTS_ID },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: Q1_ID } }) => {
        cy.log("**-- 2. Create nested card based on the first one --**");

        cy.request("POST", "/api/card", {
          name: "Q2",
          dataset_query: {
            database: 1,
            query: { "source-table": `card__${Q1_ID}` },
            type: "query",
          },
          display: "table",
          visualization_settings: {},
        }).then(({ body: { id: Q2_ID } }) => {
          cy.log("**-- 3. Create a dashboard --**");

          cy.request("POST", "/api/dashboard", {
            name: "12985D",
          }).then(({ body: { id: DASHBOARD_ID } }) => {
            cy.log("**-- 4. Add 2 filters to the dashboard --**");

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

            cy.log("**-- 5. Add nested card to the dashboard --**");

            cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
              cardId: Q2_ID,
            }).then(({ body: { id: DASH_CARD_ID } }) => {
              cy.log(
                "**-- 6. Connect dashboard filters to the nested card --**",
              );

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
                          ["field-id", PRODUCTS.CREATED_AT],
                        ],
                      },
                      {
                        parameter_id: "20976cce",
                        card_id: Q2_ID,
                        target: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
                      },
                    ],
                  },
                ],
              });
            });
            cy.visit(`/dashboard/${DASHBOARD_ID}`);
          });
        });
      });

      cy.get("fieldset")
        .last()
        .within(() => {
          cy.findByText("Category").click();
        });
      cy.log("**Failing to show dropdown in v0.36.0 through v.0.37.0**");
      popover()
        .contains("Gadget")
        .click();
      cy.findByText("Add filter").click();
      cy.url().should("contain", "?category=Gadget");
      cy.findByText("Ergonomic Silk Coat");
    });

    it.skip("Repro 2: should work for aggregated questions", () => {
      cy.log("**-- 1. Create question with aggregation --**");

      cy.request("POST", "/api/card", {
        name: "12985-v2",
        dataset_query: {
          database: 1,
          query: {
            "source-query": {
              "source-table": PRODUCTS_ID,
              aggregation: [["count"]],
              breakout: [["field-id", PRODUCTS.CATEGORY]],
            },
            filter: [">", ["field-literal", "count", "type/Integer"], 1],
          },
          type: "query",
        },
        display: "table",
        visualization_settings: {},
      }).then(({ body: { id: QUESTION_ID } }) => {
        cy.log("**-- 2. Create a dashboard --**");

        cy.request("POST", "/api/dashboard", {
          name: "12985-v2D",
        }).then(({ body: { id: DASHBOARD_ID } }) => {
          cy.log("**-- 3. Add a category filter to the dashboard --**");

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

          cy.log(
            "**-- 4. Add previously created question to the dashboard --**",
          );

          cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
            cardId: QUESTION_ID,
          }).then(({ body: { id: DASH_CARD_ID } }) => {
            cy.log(
              "**-- 5. Connect dashboard filter to the aggregated card --**",
            );

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
                        ["field-literal", "CATEGORY", "type/Text"],
                      ],
                    },
                  ],
                },
              ],
            });
          });
          cy.visit(`/dashboard/${DASHBOARD_ID}`);
        });
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

    cy.findByText("Visualize").click();
    // wait for results to load
    cy.get(".LoadingSpinner").should("not.exist");
    cy.log("**The point of failure in 0.37.0-rc3**");
    cy.contains("37.65");
    cy.findByText("There was a problem with your question").should("not.exist");
    // this is not the point of this repro, but additionally make sure the filter is working as intended on "Gizmo"
    cy.findByText("3621077291879").should("not.exist"); // one of the "Gizmo" EANs
  });

  it("'Between Dates' filter should behave consistently (metabase#12872)", () => {
    cy.request("POST", "/api/card", {
      name: "12872",
      dataset_query: {
        database: 1,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          filter: [
            "and",
            [
              "between",
              ["field-id", PRODUCTS.CREATED_AT],
              "2019-04-15",
              "2019-04-15",
            ],
            [
              "between",
              ["joined-field", "Products", ["field-id", PRODUCTS.CREATED_AT]],
              "2019-04-15",
              "2019-04-15",
            ],
          ],
          joins: [
            {
              alias: "Products",
              condition: [
                "=",
                ["field-id", PRODUCTS.ID],
                ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
        },
        type: "query",
      },
      display: "scalar",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      cy.visit(`/question/${questionId}`);
      cy.findByText("12872");
      cy.log("**At the moment of unfixed issue, it's showing '0'**");
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

    cy.log("**Reported failing on v0.36.4 and v0.36.5.1**");
    cy.get(".LoadingSpinner").should("not.exist");
    cy.findAllByText("148.23"); // one of the subtotals for this product
    cy.findAllByText("Fantastic Wool Shirt").should("not.exist");
  });

  it.skip("should filter using Custom Expression from aggregated results (metabase#12839)", () => {
    const CE_NAME = "Simple Math";

    cy.request("POST", "/api/card", {
      name: "12839",
      dataset_query: {
        database: 1,
        query: {
          filter: [">", ["field-literal", CE_NAME, "type/Float"], 0],
          "source-query": {
            aggregation: [
              ["aggregation-options", ["+", 1, 1], { "display-name": CE_NAME }],
            ],
            breakout: [["field-id", PRODUCTS.CATEGORY]],
            "source-table": PRODUCTS_ID,
          },
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: questionId } }) => {
      cy.server();
      cy.route("POST", `/api/card/${questionId}/query`).as("cardQuery");

      cy.visit(`/question/${questionId}`);
      cy.wait("@cardQuery");

      cy.log("**Reported failing on v0.35.4**");
      cy.log(`Error message: **Column 'source.${CE_NAME}' not found;**`);
      cy.findAllByText("Gizmo");
    });
  });

  it.skip("should not preserve cleared filter with the default value on refresh (metabase#13960)", () => {
    cy.log("**--1. Create a question--**");

    cy.request("POST", "/api/card", {
      name: "13960",
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field-id", PRODUCTS.CATEGORY]],
        },
        database: 1,
      },
      display: "pie",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.log("**--2. Create a dashboard--**");

      cy.request("POST", "/api/dashboard", {
        name: "13960D",
      }).then(({ body: { id: DASHBOARD_ID } }) => {
        cy.log(
          "**--3. Add filters to the dashboard and set the default value to the first one--**",
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

        cy.log("**--4. Add question to the dashboard--**");

        cy.request("POST", `/api/dashboard/${DASHBOARD_ID}/cards`, {
          cardId: QUESTION_ID,
        }).then(({ body: { id: DASH_CARD_ID } }) => {
          cy.log("**--5. Connect the filters to the card--**");

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
                    target: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
                  },
                  {
                    parameter_id: "f2bf003c",
                    card_id: QUESTION_ID,
                    target: ["dimension", ["field-id", PRODUCTS.ID]],
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
        cy.get("fieldset")
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

  it.skip("should clear default filter value in native questions (metabase#13961)", () => {
    const QUESTION_NAME = "13961";
    const [CATEGORY_FILTER, ID_FILTER] = [
      { name: "category", display_name: "Category", type: "dimension" },
      { name: "prodid", display_name: "ProdId", type: "number" },
    ];

    cy.request("POST", "/api/card", {
      name: QUESTION_NAME,
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM PRODUCTS WHERE 1=1 AND {{category}} [[AND ID={{prodid}}]]",
          "template-tags": {
            [CATEGORY_FILTER.name]: {
              id: "00315d5e-4a41-99da-1a41-e5254dacff9d",
              name: CATEGORY_FILTER.name,
              "display-name": CATEGORY_FILTER.display_name,
              type: CATEGORY_FILTER.type,
              default: "Doohickey",
              dimension: ["field-id", PRODUCTS.CATEGORY],
              "widget-type": "category",
            },
            [ID_FILTER.name]: {
              id: "4775bccc-e82a-4069-fc6b-2acc90aadb8b",
              name: ID_FILTER.name,
              "display-name": ID_FILTER.display_name,
              type: ID_FILTER.type,
              default: null,
            },
          },
        },
        database: 1,
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);

      cy.findByText(QUESTION_NAME);
      cy.findAllByText("Small Marble Shoes"); // Product ID 2, Doohickey

      cy.location("search").should("eq", "?category=Doohickey");

      // Remove default filter (category)
      cy.get("fieldset .Icon-close").click();

      cy.get(".Icon-play")
        .first()
        .should("be.visible")
        .as("rerunQuestion");

      cy.get("@rerunQuestion").click();
      cy.url().should("not.include", "?category=Doohickey");

      // Add value `1` to the ID filter
      cy.findByPlaceholderText(ID_FILTER.display_name).type("1");

      cy.get("@rerunQuestion").click();

      cy.log("**--Reported tested and failing on v0.34.3 through v0.37.3--**");
      cy.log("**URL is correct at this point, but there are no results**");
      cy.location("search").should("eq", `?${ID_FILTER.name}=1`);
      cy.findByText("Rustic Paper Wallet"); // Product ID 1, Gizmo
    });
  });

  it.skip("should not drop aggregated filters (metabase#11957)", () => {
    const AGGREGATED_FILTER = "Count is less than or equal to 20";

    cy.request("POST", "/api/card", {
      name: "11957",
      dataset_query: {
        database: 1,
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            filter: [">", ["field-id", ORDERS.CREATED_AT], "2020-01-01"],
            aggregation: [["count"]],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "day"],
            ],
          },
          filter: ["<=", ["field-literal", "count", "type/Integer"], 20],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
    });

    // Test shows two filter collapsed - click on number 2 to expand and show filter names
    cy.get(".Icon-filter")
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

  it("in a simple question should display popup for custom expression options (metabase#14341)", () => {
    openProductsTable();
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();

    // This issue has two problematic parts. We're testing for both:
    cy.log("**--1. Popover should display all custom expression options--**");
    // Popover shows up even without explicitly clicking the contenteditable field
    popover().within(() => {
      cy.findAllByRole("listitem").contains(/functions/i);
    });

    cy.log("**--2. Should not display error prematurely--**");
    cy.get("[contenteditable='true']")
      .click()
      .type("contains(");
    cy.findByText(/Checks to see if string1 contains string2 within it./i);
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
    cy.get(".Icon-calendar").click();
    cy.findByText("Add filter")
      .closest(".Button")
      .should("not.be.disabled")
      .click();
    cy.findByText(/^Created At is before/i);
  });

  it.skip("should display original custom expression filter with dates on subsequent click (metabase#12492)", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: [
            ">",
            ["field-id", ORDERS.CREATED_AT],
            [
              "fk->",
              ["field-id", ORDERS.PRODUCT_ID],
              ["field-id", PRODUCTS.CREATED_AT],
            ],
          ],
        },
        database: 1,
      },
      display: "table",
    });

    cy.wait("@dataset");
    cy.findByText(/^Created At is after/i)
      .should("not.contain", "Unknown")
      .click();
    cy.get("[contenteditable='true']").contains(
      /\[Created At\] > \[Products? -> Created At\]/,
    );
  });

  it("should handle post-aggregation filter on questions with joined table (metabase#14811)", () => {
    cy.request("POST", "/api/card", {
      name: "14811",
      dataset_query: {
        database: 1,
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "sum",
                [
                  "fk->",
                  ["field-id", ORDERS.PRODUCT_ID],
                  ["field-id", PRODUCTS.PRICE],
                ],
              ],
            ],
            breakout: [
              [
                "fk->",
                ["field-id", ORDERS.PRODUCT_ID],
                ["field-id", PRODUCTS.CATEGORY],
              ],
            ],
          },
          filter: ["=", ["field-literal", "CATEGORY", "type/Text"], "Widget"],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
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

  it.skip("should provide accurate auto-complete custom-expression suggestions based on the aggregated column name (metabase#14776)", () => {
    cy.viewport(1400, 1000); // We need a bit taller window for this repro to see all custom filter options in the popover
    cy.request("POST", "/api/card", {
      name: "14776",
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
          ],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
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

    cy.request("POST", "/api/card", {
      name: "14843",
      dataset_query: {
        database: 1,
        query: {
          "source-table": PEOPLE_ID,
          expressions: { [CC_NAME]: ["length", ["field-id", PEOPLE.CITY]] },
          filter: ["!=", ["expression", CC_NAME], 3],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}`);
    });
    cy.wait("@cardQuery");
    cy.findByText("Rye").should("not.exist");
  });
});
