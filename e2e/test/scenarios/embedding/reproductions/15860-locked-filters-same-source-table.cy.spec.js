import {
  restore,
  popover,
  visitDashboard,
  visitIframe,
  updateDashboardCards,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
        embedding_params: {
          q1_id: "locked",
          q1_category: "enabled",
          q2_id: "locked",
          q2_category: "enabled",
        },
        enable_embedding: true,
        parameters: [
          q1IdFilter,
          q1CategoryFilter,
          q2IdFilter,
          q2CategoryFilter,
        ],
      },
      cardDetails: {
        size_x: 11,
        size_y: 8,
      },
    }).then(({ body: { card_id: q1, dashboard_id } }) => {
      // Create a second question with the same source table
      cy.createQuestion({
        name: "Q2",
        query: { "source-table": PRODUCTS_ID },
      }).then(({ body: { id: q2 } }) => {
        updateDashboardCards({
          dashboard_id,
          cards: [
            // Add card for second question with parameter mappings
            {
              card_id: q2,
              row: 0,
              col: 8,
              size_x: 13,
              size_y: 8,
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
            // Add parameter mappings to first question's card
            {
              card_id: q1,
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
          ],
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Embed in your application").click();

    setDefaultValueForLockedFilter("Q1 ID", 1);
    setDefaultValueForLockedFilter("Q2 ID", 3);

    visitIframe();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Q1 Category").click();

    popover().within(() => {
      cy.findByRole("listitem")
        .should("have.length", 1)
        .and("contain", "Gizmo");
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
