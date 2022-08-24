import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("visual tests > dashboard", () => {
  const VIEWPORT_WIDTH = 2500;
  const VIEWPORT_HEIGHT = 1500;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    cy.intercept("GET", "/app/assets/geojson/**").as("geojson");
    cy.intercept("POST", "/api/dashboard/save");

    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);
    // Need to wait until cards load before saving the dashboard
    cy.wait("@geojson", { timeout: 10000 });
    cy.button("Save this").click();

    cy.findByText("Your dashboard was saved");
    cy.findByText("See it").click();

    // Find for cards to load
    cy.get(".Card").contains("18,760");
    cy.findByText("How these transactions are distributed");
  });

  describe("layout", () => {
    it("view mode", () => {
      cy.createPercySnapshot();
    });

    it("editing mode", () => {
      cy.icon("pencil").click();
      cy.createPercySnapshot();
    });
  });
});
