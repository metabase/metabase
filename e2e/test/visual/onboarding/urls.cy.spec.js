import { restore, navigationSidebar } from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

describe("visual tests > onboarding > URLs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("home", () => {
    cy.intercept("GET", `/api/automagic-dashboards/**`).as(
      "automagic-dashboards",
    );

    cy.visit("/", {
      // to give predictable messages based on randomization
      onBeforeLoad(win) {
        cy.stub(win.Math, "random").returns(0.42);
      },
    });

    cy.wait("@automagic-dashboards");

    cy.findByText("Reviews");
    cy.findByText("First collection");

    cy.createPercySnapshot();
  });

  it("root collection", () => {
    cy.intercept("GET", `api/collection/root/items*`).as("collection-items");
    cy.visit("/collection/root");

    // Twice, one for pinned items and another for dashboard
    cy.wait("@collection-items");
    cy.wait("@collection-items");

    navigationSidebar().within(() => {
      cy.findByText("First collection");
      cy.findByText("Your personal collection");
    });
    cy.get("main").within(() => {
      cy.findByText("Orders");
      cy.findByText("First collection");
    });

    cy.createPercySnapshot();
  });

  it("browse", () => {
    cy.intercept("GET", `api/database`).as("database");
    cy.visit("/browse/");

    cy.wait("@database");
    cy.findByText("Sample Database");

    cy.createPercySnapshot();
  });

  it("browse/1 (Sample Database)", () => {
    cy.intercept("GET", `api/database/${SAMPLE_DB_ID}/schemas`).as("schemas");
    cy.visit("/browse/1");

    cy.wait("@schemas");
    cy.findByText("Sample Database");
    cy.findByText("Reviews");

    cy.createPercySnapshot();
  });
});
