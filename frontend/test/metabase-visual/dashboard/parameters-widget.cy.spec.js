import { restore, visitDashboard } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { MAXIMUM_PARAMETERS_FOR_STICKINESS } from "metabase/dashboard/components/Dashboard/stickyParameters";

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

const filters = new Array(MAXIMUM_PARAMETERS_FOR_STICKINESS + 1).fill(filter);

describe("visual tests > dashboard > parameters widget", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({
      questionDetails,
    }).then(({ body: card }) => {
      const { dashboard_id } = card;

      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters: filters,
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
  describe("Stickiness on desktop", () => {
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
  describe("Stickiness on mobile", () => {
    // resize window to mobile form factor
    cy.viewport(480, 800);

    it("is not sticky in view mode", () => {
      cy.findByText("test question");

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
