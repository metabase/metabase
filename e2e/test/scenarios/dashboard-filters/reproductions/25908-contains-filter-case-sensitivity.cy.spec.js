import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "25908",
  query: {
    "source-table": PRODUCTS_ID,
  },
};

const dashboardFilter = {
  name: "Text contains",
  slug: "text_contains",
  id: "28c6ada9",
  type: "string/contains",
  sectionId: "string",
};

const dashboardDetails = {
  parameters: [dashboardFilter],
};

const CASE_INSENSITIVE_ROWS = 30;

describe("issue 25908", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard_id}/dashcard/${id}/card/${card_id}/query`,
        ).as("dashcardQuery");

        cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 17,
              size_y: 11,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                },
              ],
            },
          ],
        });

        // Note the capital first letter
        cy.visit(`/dashboard/${dashboard_id}?text_contains=Li`);
        cy.wait("@dashcardQuery");
        cy.contains(new RegExp(`^Rows 1-\\d+ of ${CASE_INSENSITIVE_ROWS}$`));
      },
    );
  });

  it("`contains` dashboard filter should respect case insensitivity on a title-drill-through (metabase#25908)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questionDetails.name).click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Title contains Li");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`Showing ${CASE_INSENSITIVE_ROWS} rows`);
  });
});
