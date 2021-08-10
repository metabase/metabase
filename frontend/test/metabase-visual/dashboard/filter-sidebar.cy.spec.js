import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS_ID } = SAMPLE_DATASET;

const questionDetails = {
  query: { "source-table": ORDERS_ID },
};

describe("visual tests > dashboard > filter sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { card_id, dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      },
    );
  });

  it("renders correctly", () => {
    openFilterSidebar();

    cy.findByText("Label");

    cy.percySnapshot();
  });
});

function openFilterSidebar() {
  cy.icon("pencil").click();
  cy.icon("filter").click();
  cy.findByText("Time").click();
  cy.findByText("Month and Year").click();
}
