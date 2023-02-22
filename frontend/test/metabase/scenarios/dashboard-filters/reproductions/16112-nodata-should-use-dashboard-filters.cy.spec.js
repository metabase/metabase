import { restore, popover, visitDashboard } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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
              size_x: 12,
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

        cy.signIn("nodata");
        visitDashboard(dashboard_id);
      },
    );

    cy.findByText(ratingFilter.name).click();
    popover().contains("3").click();
    cy.button("Add filter").click();

    cy.get(".DashCard").should("contain", "maia").and("contain", "daryl");
    cy.location("search").should("eq", "?rating=3");

    cy.findByText(reviewerFilter.name).click();
    cy.findByPlaceholderText("Enter some text").type("maia{enter}").blur();
    cy.button("Add filter").click();

    cy.get(".DashCard").should("contain", "maia").and("not.contain", "daryl");
    cy.location("search").should("eq", "?reviewer=maia&rating=3");
  });
});
