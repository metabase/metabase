import {
  signInAsAdmin,
  restore,
  openOrdersTable,
  openProductsTable,
  popover,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

describe("scenarios > question > filter", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it.skip("should load needed data (metabase#12985)", () => {
    // Save a Question
    openProductsTable();
    cy.findByText("Save").click();
    cy.findByPlaceholderText("What is the name of your card?")
      .clear()
      .type("Q1");
    cy.findAllByText("Save")
      .last()
      .click();
    cy.findByText("Not now").click();

    // From Q1, save Q2
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("Q1").click();
    cy.findByText("Save").click();
    cy.findByPlaceholderText("What is the name of your card?")
      .clear()
      .type("Q2");
    cy.findAllByText("Save")
      .last()
      .click();

    // Add Q2 to a dashboard
    cy.findByText("Yes please!").click();
    cy.findByText("Orders in a dashboard").click();

    // Add two dashboard filters
    cy.get(".Icon-filter").click();
    cy.findByText("Time").click();
    cy.findByText("All Options").click();
    cy.findAllByText("Select…")
      .last()
      .click();
    cy.findByText("Created At").click();

    cy.get(".Icon-filter").click();
    cy.findByText("Other Categories").click();
    cy.findAllByText("Select…")
      .last()
      .click();
    popover().within(() => {
      cy.findByText("Category").click();
    });

    // Save dashboard and refresh page
    cy.findAllByText("Done")
      .first()
      .click();

    cy.findByText("Save").click();
    cy.findByText("You're editing this dashboard.").should("not.exist");

    // Check category search
    cy.get("fieldset")
      .last()
      .within(() => {
        cy.findByText("Category").click();
      });
    cy.log("**Failing to show dropdown in v0.36.0 through v.0.37.0**");
    cy.findByText("Gadget").click();
    cy.findByText("Add filter").click();
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
});
