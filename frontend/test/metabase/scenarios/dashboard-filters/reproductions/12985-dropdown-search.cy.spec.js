import {
  restore,
  filterWidget,
  popover,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const categoryFilter = {
  name: "Category",
  slug: "category",
  id: "2a12e66c",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = { parameters: [categoryFilter] };

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
      const nestedQuestion = {
        name: "Q2",
        query: { "source-table": `card__${Q1_ID}` },
      };

      cy.createQuestionAndDashboard({
        questionDetails: nestedQuestion,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.log("Connect dashboard filters to the nested card");

        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 10,
              size_y: 8,
              series: [],
              visualization_settings: {},
              // Connect filter to the card
              parameter_mappings: [
                {
                  parameter_id: categoryFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
      });
    });

    filterWidget().contains("Category").click();
    cy.log("Failing to show dropdown in v0.36.0 through v.0.37.0");

    popover().within(() => {
      cy.findByText("Doohickey");
      cy.findByText("Gizmo");
      cy.findByText("Widget");
      cy.findByText("Gadget").click();
    });
    cy.button("Add filter").click();

    cy.location("search").should("eq", "?category=Gadget");
    cy.findByText("Ergonomic Silk Coat");
  });

  it.skip("should work for aggregated questions (metabase#12985-2)", () => {
    const questionDetails = {
      name: "12985-v2",
      query: {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1],
      },
    };

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.log("Connect dashboard filter to the aggregated card");

        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 8,
              size_y: 6,
              series: [],
              visualization_settings: {},
              // Connect filter to the card
              parameter_mappings: [
                {
                  parameter_id: categoryFilter.id,
                  card_id,
                  target: [
                    "dimension",
                    ["field", "CATEGORY", { "base-type": "type/Text" }],
                  ],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );

    filterWidget().contains("Category").click();
    // It will fail at this point until the issue is fixed because popover never appears
    popover().contains("Gadget").click();
    cy.findByText("Add filter").click();
    cy.url().should("contain", "?category=Gadget");
    cy.findByText("Ergonomic Silk Coat");
  });
});
