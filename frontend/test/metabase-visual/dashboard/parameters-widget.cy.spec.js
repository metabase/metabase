import { restore, visitDashboard } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  query: { "source-table": PRODUCTS_ID },
};

const filter = {
  name: "Category",
  slug: "category",
  id: "ad1c877e",
  type: "category",
};

const parameters = new Array(12).fill(filter);

describe(`visual tests > dashboard > parameters widget (${parameters.length} filters)`, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({
      questionDetails,
    }).then(({ body: card }) => {
      const { dashboard_id } = card;

      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters,
      });

      const updatedSize = {
        sizeX: 12,
        sizeY: 32,
      };

      cy.editDashboardCard(card, updatedSize);

      visitDashboard(dashboard_id);
    });
  });

  // desktop
  describe(`Stickiness on desktop (${parameters.length} filters)`, () => {
    it("is sticky in view mode", () => {
      cy.findByText("test question");

      cy.get("main").scrollTo(0, 264);

      cy.percySnapshot();
    });

    it("is sticky in edit mode", () => {
      cy.findByText("test question");

      cy.icon("pencil").click();

      cy.findByTestId("dashboard-parameters-and-cards")
        .scrollTo(0, 464)
        .then(() => {
          cy.percySnapshot();
        });
    });
  });

  // mobile
  describe(`Stickiness on mobile (${parameters.length} filters)`, () => {
    it("is not sticky in view mode", () => {
      cy.findByText("test question");

      // iPhone SE
      cy.viewport(375, 667);

      cy.get("main").scrollTo(0, 264);

      cy.percySnapshot();
    });

    it("is not sticky in edit mode", () => {
      cy.findByText("test question");

      cy.icon("pencil").click();

      cy.findByTestId("dashboard-parameters-and-cards")
        .scrollTo(0, 464)
        .then(() => {
          cy.percySnapshot();
        });
    });
  });
});
