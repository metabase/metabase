const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding setup flow", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
  });

  it("shows a preview iframe when visiting the new embed page", () => {
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
});

const getPreviewIframe = () =>
  cy
    .get("iframe")
    .should("be.visible")
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty");
