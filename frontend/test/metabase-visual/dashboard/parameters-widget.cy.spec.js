import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS_ID } = SAMPLE_DATASET;

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
      ({ body: card }) => {
        const { dashboard_id } = card;

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: filters,
        });

        const updatedSize = {
          sizeX: 12,
          sizeY: 32,
        };

        cy.editDashboardCard(card, updatedSize);

        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );
  });

  it("is sticky in view mode", () => {
    cy.findByText("test question");

    cy.scrollTo(0, 264);

    cy.percySnapshot();
  });
});
