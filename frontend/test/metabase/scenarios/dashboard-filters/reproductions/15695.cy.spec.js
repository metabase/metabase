import { restore, filterWidget } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const filter = {
  name: "Text",
  slug: "text",
  id: "de9f36f0",
  type: "string/=",
  sectionId: "string",
};

const questionDetails = {
  name: "15695",
  query: { "source-table": PRODUCTS_ID },
};

describe("issue 15695", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("dashboard filters should not limit the number of search results (metabase#15695)", () => {
    // Change filtering on this field to "a list of all values"
    cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
      has_field_values: "list",
    });

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
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                },
              ],
            },
          ],
        });

        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );

    filterWidget().click();
    cy.findByPlaceholderText("Search the list").type("Syner");
    cy.findByText("Synergistic Wool Coat");
  });
});
