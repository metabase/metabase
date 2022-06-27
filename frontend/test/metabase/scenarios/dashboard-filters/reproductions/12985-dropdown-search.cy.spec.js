import {
  restore,
  filterWidget,
  popover,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("issue 12985 > dashboard filter dropdown/search", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should work for saved nested questions (metabase#12985-1)", () => {
    cy.createQuestion({
      name: "Q1",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: Q1_ID } }) => {
      // Create nested card based on the first one
      cy.createQuestion({
        name: "Q2",
        query: { "source-table": `card__${Q1_ID}` },
      }).then(({ body: { id: Q2_ID } }) => {
        cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
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
                      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                    },
                  ],
                },
              ],
            });
          });
          visitDashboard(DASHBOARD_ID);
        });
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

  it.skip("should work for aggregated questions (metabase#12985-2)", () => {
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
      cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
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
        visitDashboard(DASHBOARD_ID);
      });
    });

    filterWidget()
      .contains("Category")
      .click();
    // It will fail at this point until the issue is fixed because popover never appears
    popover()
      .contains("Gadget")
      .click();
    cy.findByText("Add filter").click();
    cy.url().should("contain", "?category=Gadget");
    cy.findByText("Ergonomic Silk Coat");
  });
});
