import {
  describeEE,
  getIframeBody,
  popover,
  restore,
  setTokenFeatures,
  visitDashboard,
} from "e2e/support/helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

describeEE("issue 26988", () => {
  beforeEach(() => {
    restore();
    cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");

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

    cy.icon("share").click();
    cy.findByRole("button", { name: "Set up" }).click();
    cy.wait("@dashboard");

    getIframeBody().should("have.css", "font-family", `Lato, sans-serif`);

    cy.findByTestId("embedding-settings").findByLabelText("Font").click();
    popover().findByText("Oswald").click();
    cy.wait("@dashboard");
    getIframeBody().should("have.css", "font-family", `Oswald, sans-serif`);

    cy.findByTestId("embedding-settings").findByLabelText("Font").click();
    popover().findByText("Slabo 27px").click();
    cy.wait("@dashboard");
    getIframeBody().should(
      "have.css",
      "font-family",
      `"Slabo 27px", sans-serif`,
    );
  });
});
