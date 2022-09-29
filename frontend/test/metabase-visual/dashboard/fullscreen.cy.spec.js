import { restore, visitDashboard } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: { "source-table": PRODUCTS_ID },
};

const filter = {
  name: "Category",
  slug: "category",
  id: "ad1c877e",
  type: "category",
};

describe("visual tests > dashboard > fullscreen", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.addFilterToDashboard({ filter, dashboard_id });

        // Connect filter to the card
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
                  parameter_id: "ad1c877e",
                  card_id,
                  target: ["dimension", ["field-id", PRODUCTS.CATEGORY]],
                },
              ],
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );
  });

  it("renders in day mode and night mode", () => {
    cy.get("main header").within(() => {
      cy.icon("ellipsis").click();
    });

    cy.findAllByText("Enter fullscreen").click();

    cy.icon("moon");

    cy.createPercySnapshot("day");

    cy.icon("moon").click();

    cy.icon("sun");

    cy.createPercySnapshot("night");

    cy.icon("contract").click();
  });
});
