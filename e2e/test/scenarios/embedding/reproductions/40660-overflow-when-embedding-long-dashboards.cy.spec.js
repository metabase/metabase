import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getIframeBody,
  openStaticEmbeddingModal,
  restore,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Products",
  query: { "source-table": PRODUCTS_ID, limit: 2 },
};

const dashboardDetails = {
  name: "long dashboard",
  enable_embedding: true,
};

describe("issue 40660", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );

    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      updateDashboardCards({
        dashboard_id,
        cards: [{ card_id }, { card_id }, { card_id }],
      });

      visitDashboard(dashboard_id);
    });
  });

  it("static dashboard content shouldn't overflow its container (metabase#40660)", () => {
    openStaticEmbeddingModal({
      activeTab: "parameters",
      previewMode: "preview",
    });

    getIframeBody().within(() => {
      cy.findByTestId("embed-frame").scrollTo("bottom");

      cy.findByRole("link", { name: "Powered by Metabase" }).should(
        "be.visible",
      );
    });
  });
});
