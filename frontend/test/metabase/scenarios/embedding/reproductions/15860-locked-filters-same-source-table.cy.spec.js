import {
  restore,
  popover,
  visitDashboard,
  visitIframe,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const q1IdFilter = {
  name: "Q1 ID",
  slug: "q1_id",
  id: "fde6db8b",
  type: "id",
  sectionId: "id",
  default: [1],
};

const q1CategoryFilter = {
  name: "Q1 Category",
  slug: "q1_category",
  id: "e8ff3175",
  type: "string/=",
  sectionId: "string",
  filteringParameters: [q1IdFilter.id],
};

const q2IdFilter = {
  name: "Q2 ID",
  slug: "q2_id",
  id: "t3e6hb7b",
  type: "id",
  sectionId: "id",
  default: [3],
};

const q2CategoryFilter = {
  name: "Q2 Category",
  slug: "q2_category",
  id: "ca1n357o",
  type: "string/=",
  sectionId: "string",
  filteringParameters: [q2IdFilter.id],
};

describe.skip("issue 15860", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({
      questionDetails: {
        name: "Q1",
        query: { "source-table": PRODUCTS_ID },
      },
      dashboardDetails: {
        parameters: [
          q1IdFilter,
          q1CategoryFilter,
          q2IdFilter,
          q2CategoryFilter,
        ],
      },
    }).then(({ body: { id: q1DashCard, card_id: q1, dashboard_id } }) => {
      // Create a second question with the same source table
      cy.createQuestion({
        name: "Q2",
        query: { "source-table": PRODUCTS_ID },
      }).then(({ body: { id: q2 } }) => {
        // Add it to the dashboard
        cy.request("POST", `/api/dashboard/${dashboard_id}/cards`, {
          cardId: q2,
        }).then(({ body: { id: q2DashCard } }) => {
          // Map filters to the cards and rearrange cards so they can nicely fit
          cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
            cards: [
              {
                id: q1DashCard,
                card_id: q1,
                row: 0,
                col: 0,
                size_x: 8,
                size_y: 6,
                series: [],
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: q1IdFilter.id,
                    card_id: q1,
                    target: ["dimension", ["field", PRODUCTS.ID, null]],
                  },
                  {
                    parameter_id: q1CategoryFilter.id,
                    card_id: q1,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                ],
              },
              {
                id: q2DashCard,
                card_id: q2,
                row: 0,
                col: 8,
                size_x: 10,
                size_y: 6,
                series: [],
                visualization_settings: {},
                parameter_mappings: [
                  {
                    parameter_id: q2IdFilter.id,
                    card_id: q2,
                    target: ["dimension", ["field", PRODUCTS.ID, null]],
                  },
                  {
                    parameter_id: q2CategoryFilter.id,
                    card_id: q2,
                    target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                  },
                ],
              },
            ],
          });
        });
      });

      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        embedding_params: {
          q1_id: "locked",
          q1_category: "enabled",
          q2_id: "locked",
          q2_category: "enabled",
        },
        enable_embedding: true,
      });

      visitDashboard(dashboard_id);
    });
  });

  it("should work for locked linked filters connected to different cards with the same source table (metabase#15860)", () => {
    cy.icon("share").click();
    cy.findByText("Embed this dashboard in an application").click();

    setDefaultValueForLockedFilter("Q1 ID", 1);
    setDefaultValueForLockedFilter("Q2 ID", 3);

    visitIframe();

    cy.findByText("Q1 Category").click();

    popover().within(() => {
      cy.findByRole("listitem")
        .should("have.length", 1)
        .and("contain", "Gizmo");
    });

    cy.findByText("Q2 Category").click();

    popover().within(() => {
      cy.findByRole("listitem")
        .should("have.length", 1)
        .and("contain", "Doohickey");
    });
  });
});

function setDefaultValueForLockedFilter(filter, value) {
  cy.findByText("Preview Locked Parameters")
    .parent()
    .within(() => {
      cy.findByText(filter).click({ force: true });
    });

  cy.findByPlaceholderText("Enter an ID").type(`${value}{enter}`);
  cy.button("Add filter").click();
}
