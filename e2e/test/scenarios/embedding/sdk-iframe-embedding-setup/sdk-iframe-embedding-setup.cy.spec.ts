const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding setup flow", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
  });

  it("shows dashboard experience by default", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    const iframe = getPreviewIframe();
    iframe.within(() => {
      cy.log("dashboard title is visible");
      cy.findByText("Person overview").should("be.visible");

      cy.log("dashboard card is visible");
      cy.findByText("Person detail").should("be.visible");
    });
  });

  it("shows chart experience when selected", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    cy.log("clicking on Chart tab");
    getEmbedSidebar().findByText("Chart").click();

    const iframe = getPreviewIframe();
    iframe.within(() => {
      cy.log("question title is visible");
      cy.findByText("Query log").should("be.visible");
    });
  });

  it("shows exploration template when selected", () => {
    cy.visit("/embed/new");
    cy.wait("@dashboard");

    getEmbedSidebar().findByText("Exploration").click();

    const iframe = getPreviewIframe();
    iframe.within(() => {
      cy.log("data picker is visible");
      cy.findByText("Pick your starting data").should("be.visible");
    });
  });
});

const getPreviewIframe = () =>
  cy
    .get("iframe")
    .should("be.visible")
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty");

const getEmbedSidebar = () => cy.findByTestId("embed-sidebar-content");
