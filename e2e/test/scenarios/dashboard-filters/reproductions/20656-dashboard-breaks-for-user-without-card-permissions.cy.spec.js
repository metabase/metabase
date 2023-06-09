import {
  restore,
  filterWidget,
  visitDashboard,
  editDashboard,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const filter = {
  name: "ID",
  slug: "id",
  id: "11d79abe",
  type: "id",
  sectionId: "id",
};

const questionDetails = {
  query: { "source-table": PRODUCTS_ID, limit: 2 },
  // Admin's personal collection is always the first one (hence, the id 1)
  collection_id: 1,
};

const dashboardDetails = {
  parameters: [filter],
};

describe("issue 20656", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow a user to visit a dashboard even without a permission to see the dashboard card (metabase#20656, metabase#24536)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.ID, null]],
                },
              ],
            },
          ],
        });

        cy.signInAsNormalUser();

        visitDashboard(dashboard_id);
      },
    );

    // Make sure the filter widget is there
    filterWidget();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don't have permission to see this card.");

    // Trying to edit the filter should not show mapping fields and shouldn't break frontend (metabase#24536)
    editDashboard();

    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .find(".Icon-gear")
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Column to filter on")
      .parent()
      .within(() => {
        cy.icon("key");
      });
  });
});
