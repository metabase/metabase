import { restore } from "__support__/e2e/cypress";

const questionDetails = {
  query: { "source-table": 2 },
};

describe("visual tests > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("edit", () => {
    describe("filter", () => {
      it("shows filter sidebar", () => {
        cy.createQuestionAndDashboard({ questionDetails }).then(
          ({ body: { card_id, dashboard_id } }) => {
            cy.visit(`/dashboard/${dashboard_id}`);

            openFilterSidebar();

            cy.findByText("Label");

            cy.percySnapshot("Shows dashboard filter sidebar " + Date.now());
          },
        );
      });
    });
  });
});

function openFilterSidebar() {
  cy.icon("pencil").click();
  cy.icon("filter").click();
  cy.findByText("Time").click();
  cy.findByText("Month and Year").click();
}
