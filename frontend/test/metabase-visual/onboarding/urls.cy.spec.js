import { restore } from "__support__/e2e/cypress";

describe("visual tests > onboarding > URLs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("home", () => {
    cy.intercept("GET", `/api/automagic-dashboards`).as("automagic-dashboards");

    cy.visit("/", {
      // to give predictable messages based on randomization
      onBeforeLoad(win) {
        cy.stub(win.Math, "random").returns(0.42);
      },
    });

    cy.wait("@automagic-dashboards");

    cy.findByText("Reviews table");
    cy.findByText("First collection");
    cy.findByText("Sample Dataset");

    cy.percySnapshot();
  });

  it("root collection", () => {
    cy.intercept("GET", `api/collection/root/items`).as("collection-items");
    cy.visit("/collection/root");

    // Twice, one for pinned items and another for dashboard
    cy.wait("@collection-items");
    cy.wait("@collection-items");

    cy.findByText("First collection");
    cy.findByText("Your personal collection");

    cy.percySnapshot();
  });

  it("browse", () => {
    cy.intercept("GET", `api/database`).as("database");
    cy.visit("/browse/");

    cy.wait("@database");
    cy.findByText("Sample Dataset");

    cy.percySnapshot();
  });

  it("browse/1 (Sample Dataset)", () => {
    cy.intercept("GET", `api/database/1/schemas`).as("schemas");
    cy.visit("/browse/1");

    cy.wait("@schemas");
    cy.findByText("Sample Dataset");
    cy.findByText("Reviews");

    cy.percySnapshot();
  });
});
