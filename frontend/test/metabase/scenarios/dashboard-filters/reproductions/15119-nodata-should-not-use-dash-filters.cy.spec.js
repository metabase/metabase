import {
  restore,
  filterWidget,
  popover,
  visitDashboard,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 15119", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("user without data permissions should be able to use dashboard filter (metabase#15119)", () => {
    const questionDetails = {
      name: "15119",
      query: { "source-table": PRODUCTS_ID },
    };

    const filter = {
      name: "Category",
      slug: "category",
      id: "ad1c877e",
      type: "category",
    };

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
              sizeX: 12,
              sizeY: 9,
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

        cy.signIn("nodata");
        visitDashboard(dashboard_id);
      },
    );

    filterWidget()
      .contains("Category")
      .click();

    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.contains("Rustic Paper Wallet");
  });
});
