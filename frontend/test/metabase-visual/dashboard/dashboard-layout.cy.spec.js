import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const X_RAYED_ORDERS_TABLE_CARD_COUNT = 8;

describe("visual tests > dashboard", () => {
  const VIEWPORT_WIDTH = 2500;
  const VIEWPORT_HEIGHT = 1500;

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    cy.intercept("GET", "/app/assets/geojson/**").as("geojson");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "getCardQuery",
    );
    cy.intercept("POST", "/api/dashboard/save");

    cy.visit(`/auto/dashboard/table/${ORDERS_ID}`);
    // Need to wait until cards load before saving the dashboard
    cy.wait("@geojson", { timeout: 10000 });
    cy.button("Save this").click();

    cy.findByText("Your dashboard was saved");
    cy.findByText("See it").click();

    cy.wait("@getCardQuery");

    // Ensure all the card queries were awaited. Learn more:
    // https://github.com/cypress-io/cypress/issues/14916
    cy.get("@getCardQuery.all").should(
      "have.length",
      X_RAYED_ORDERS_TABLE_CARD_COUNT,
    );

    // Ensure the UI is in place after loading
    cy.get(".Card").contains("18,760"); // first number card
    cy.findByText("How these transactions are distributed"); // markdown card
    cy.findByText("Incredible Aluminum Knife"); // one of the table card records
  });

  it("layout", () => {
    cy.createPercySnapshot("view mode");

    cy.icon("pencil").click();
    cy.createPercySnapshot("edit mode");
  });
});
