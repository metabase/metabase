import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  describeEE,
  getIframeBody,
  openStaticEmbeddingModal,
  popover,
  restore,
  setTokenFeatures,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describeEE("issue 26988", () => {
  beforeEach(() => {
    restore();
    cy.intercept("GET", "/api/preview_embed/dashboard/*").as(
      "previewDashboard",
    );

    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should apply embedding settings passed in URL on load", () => {
    cy.createQuestionAndDashboard({
      questionDetails: {
        name: "Q1",
        query: {
          "source-table": ORDERS_ID,
          limit: 3,
        },
      },
      dashboardDetails: {
        enable_embedding: true,
      },
    }).then(({ body: card }) => {
      visitDashboard(card.dashboard_id);
    });

    openStaticEmbeddingModal({
      activeTab: "appearance",
      previewMode: "preview",
      acceptTerms: false,
    });

    cy.wait("@previewDashboard");
    getIframeBody().should("have.css", "font-family", "Lato, sans-serif");

    cy.findByLabelText("Playing with appearance options")
      .findByLabelText("Font")
      .as("font-control")
      .click();
    popover().findByText("Oswald").click();

    getIframeBody().should("have.css", "font-family", "Oswald, sans-serif");

    cy.get("@font-control").click();
    popover().findByText("Slabo 27px").click();

    getIframeBody().should(
      "have.css",
      "font-family",
      '"Slabo 27px", sans-serif',
    );
  });
});
