import { restore, popover, visitDashboard } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issues 15119 and 16112", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${REVIEWS.REVIEWER}`, {
      has_field_values: "list",
      semantic_type: "type/Category",
    });

    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      has_field_values: "list",
      semantic_type: "type/Category",
    });
  });

  it("user without data permissions should be able to use dashboard filters (metabase#15119, metabase#16112)", () => {
    const questionDetails = {
      name: "15119",
      query: { "source-table": REVIEWS_ID },
    };

    const ratingFilter = {
      name: "Rating Filter",
      slug: "rating",
      id: "5dfco74e",
      type: "string/=",
      sectionId: "string",
    };

    const reviewerFilter = {
      name: "Reviewer Filter",
      slug: "reviewer",
      id: "ad1c877e",
      type: "string/=",
      sectionId: "string",
    };

    const dashboardDetails = { parameters: [reviewerFilter, ratingFilter] };

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Connect filters to the card
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 9,
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: ratingFilter.id,
                  card_id,
                  target: ["dimension", ["field", REVIEWS.RATING, null]],
                },
                {
                  parameter_id: reviewerFilter.id,
                  card_id,
                  target: ["dimension", ["field", REVIEWS.REVIEWER, null]],
                },
              ],
            },
          ],
        });

        // Actually need to setup the linked filter:
        visitDashboard(dashboard_id);
        cy.get('[data-metabase-event="Dashboard;Edit"]').click();
        cy.findByText("Rating Filter").click();
        cy.findByText("Linked filters").click();
        // cy.findByText("Reviewer Filter").click();
        cy.findByText("Limit this filter's choices")
          .parent()
          .within(() => {
            // turn on the toggle
            cy.get("input").click();
          });
        cy.findByText("Save").click();

        cy.signIn("nodata");
        visitDashboard(dashboard_id);
      },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(reviewerFilter.name).click();
    popover().contains("adam").click();
    cy.button("Add filter").click();

    cy.get(".DashCard").should("contain", "adam");
    cy.location("search").should("eq", "?reviewer=adam");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ratingFilter.name).click();

    popover().contains("5").click();
    cy.button("Add filter").click();

    cy.get(".DashCard").should("contain", "adam");
    cy.get(".DashCard").should("contain", "5");
    cy.location("search").should("eq", "?reviewer=adam&rating=5");
  });
});
