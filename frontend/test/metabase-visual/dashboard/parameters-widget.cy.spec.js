import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const questionDetails = {
  query: { "source-table": PRODUCTS_ID },
};

const filter = {
  name: "Category",
  slug: "category",
  id: "ad1c877e",
  type: "category",
};

const filters = new Array(12).fill(filter);

describe("visual tests > dashboard > parameters widget", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: filters,
        });

        // Connect filter to the card
        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              sizeX: 12,
              sizeY: 32,
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

        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );
  });

  it("is sticky in view mode", () => {
    cy.scrollTo(0, 164);

    cy.percySnapshot();
  });
});
