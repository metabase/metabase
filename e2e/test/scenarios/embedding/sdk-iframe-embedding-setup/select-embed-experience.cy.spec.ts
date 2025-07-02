const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > select embed experience", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
  });

  it("shows dashboard experience by default", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    H.getIframeBody().within(() => {
      cy.log("dashboard title is visible");
      cy.findByText("Person overview").should("be.visible");

      cy.log("dashboard card is visible");
      cy.findByText("Person detail").should("be.visible");
    });
  });

  it("shows chart experience when selected", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    getEmbedSidebar().findByText("Chart").click();

    H.getIframeBody().within(() => {
      cy.log("question title is visible");
      cy.findByText("Query log").should("be.visible");
    });
  });

  it("shows exploration template when selected", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    getEmbedSidebar().findByText("Exploration").click();

    H.getIframeBody().within(() => {
      cy.log("data picker is visible");
      cy.findByText("Pick your starting data").should("be.visible");
    });
  });

  it("localizes the iframe preview when ?locale is passed", () => {
    cy.visit("/embed/new?locale=fr");
    cy.wait("@dashboard");

    // TODO: update this test once "Exploration" is localized in french.
    getEmbedSidebar().findByText("Exploration").click();

    H.getIframeBody().within(() => {
      cy.log("data picker is localized");
      cy.findByText("Choisissez vos données de départ").should("be.visible");
    });
  });
});

const getEmbedSidebar = () => cy.findByRole("complementary");
