import {
  restore,
  visitEmbeddedPage,
  filterWidget,
  visitPublicDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

const ccName = "CC Reviewer";

const dashboardFilter = {
  name: "Text ends with",
  slug: "text_ends_with",
  id: "3a8ecdbd",
  type: "string/ends-with",
  sectionId: "string",
};

const questionDetails = {
  name: "25473",
  query: {
    "source-table": REVIEWS_ID,
    expressions: { [ccName]: ["field", REVIEWS.REVIEWER, null] },
    limit: 10,
    // Let's show only a few columns to make it easier to focus on the UI
    fields: [
      ["field", REVIEWS.REVIEWER, null],
      ["field", REVIEWS.RATING, null],
      ["field", REVIEWS.CREATED_AT, null],
      ["expression", ccName, null],
    ],
  },
};

const dashboardDetails = {
  name: "25473D",
  parameters: [dashboardFilter],
};

describe("issue 25473", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 12,
              size_y: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id,
                  target: ["dimension", ["expression", ccName, null]],
                },
              ],
            },
          ],
        });

        cy.wrap(dashboard_id).as("dashboardId");
      },
    );
  });

  it("public sharing: dashboard text filter on a custom column should accept text input (metabase#25473-1)", () => {
    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id);
    });

    assertOnResults();
  });

  it("signed embedding: dashboard text filter on a custom column should accept text input (metabase#25473-2)", () => {
    cy.get("@dashboardId").then(id => {
      cy.request("PUT", `/api/dashboard/${id}`, {
        embedding_params: {
          [dashboardFilter.slug]: "enabled",
        },
        enable_embedding: true,
      });

      const payload = {
        resource: { dashboard: id },
        params: {},
      };

      visitEmbeddedPage(payload);
    });

    assertOnResults();
  });
});

function assertOnResults() {
  cy.findAllByTestId("column-header").last().should("have.text", ccName);
  cy.findAllByText("xavier").should("have.length", 2);

  filterWidget().click();
  cy.findByPlaceholderText("Enter some text").type("e").blur();
  cy.button("Add filter").click();

  cy.location("search").should("eq", `?${dashboardFilter.slug}=e`);
  cy.findAllByText("xavier").should("not.exist");
  cy.findAllByText("cameron.nitzsche").should("have.length", 2);
}
