import { restore, popover, visitDashboard } from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("issue 17160", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion({
      name: `17160`,
      native: {
        query: "SELECT * FROM products WHERE {{CATEGORY}}",
        "template-tags": {
          CATEGORY: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            name: "CATEGORY",
            display_name: "CATEGORY",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "category",
            default: null,
          },
        },
      },
    }).then(({ body: { id: questionId } }) => {
      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        // Add the question to the dashboard
        cy.request("POST", `/api/dashboard/${dashboardId}/cards`, {
          cardId: questionId,
        }).then(({ body: { id: dashCardId } }) => {
          // Add dashboard filter
          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
            parameters: [
              {
                id: "7c9ege62",
                name: "Category",
                slug: "category",
                type: "category",
              },
            ],
          });

          // Create a click behavior and resize the question card
          cy.request("PUT", `/api/dashboard/${dashboardId}/cards`, {
            cards: [
              {
                id: dashCardId,
                card_id: questionId,
                row: 0,
                col: 0,
                sizeX: 12,
                sizeY: 10,
                parameter_mappings: [
                  {
                    parameter_id: "7c9ege62",
                    card_id: 4,
                    target: ["dimension", ["template-tag", "CATEGORY"]],
                  },
                ],
                visualization_settings: getVisualSettingsWithClickBehavior(
                  questionId,
                ),
              },
            ],
          });

          visitDashboard(dashboardId);
        });
      });
    });
  });

  it("should pass multiple filter values to a SQL question parameter (metabase#17160)", () => {
    cy.findByText("Category").click();

    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.findByText("Gadget").click();

      cy.button("Add filter").click();
    });

    cy.findAllByText("click-behavior-label")
      .eq(0)
      .click();

    cy.url().should("include", "/question");

    cy.findByText("2 selections").click();

    cy.findByTestId("Doohickey-filter-value").within(() =>
      cy.get("input").should("be.checked"),
    );
    cy.findByTestId("Gadget-filter-value").within(() =>
      cy.get("input").should("be.checked"),
    );
  });
});

function getVisualSettingsWithClickBehavior(targetId) {
  return {
    column_settings: {
      '["name","ID"]': {
        click_behavior: {
          targetId,
          parameterMapping: {
            "6b8b10ef-0104-1047-1e1b-2492d5954322": {
              source: {
                type: "parameter",
                id: "7c9ege62",
                name: "Category",
              },
              target: {
                type: "variable",
                id: "CATEGORY",
              },
              id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            },
          },
          linkType: "question",
          type: "link",
          linkTextTemplate: "click-behavior-label",
        },
      },
    },
  };
}
