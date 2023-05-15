import { restore, openReviewsTable, modal } from "e2e/support/helpers";

describe("visual tests > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.viewport(1600, 860);
    cy.signInAsNormalUser();

    openReviewsTable();

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("ad-hoc with long column trimmed", () => {
    cy.createPercySnapshot();
  });

  it("ad-hoc with long column expanded", () => {
    cy.findAllByTestId("expand-column").eq(0).click({ force: true });

    cy.createPercySnapshot();
  });

  it("saved", () => {
    saveQuestion();
    cy.createPercySnapshot();
  });
});

function saveQuestion() {
  cy.intercept("POST", "/api/card").as("saveQuestion");

  cy.findByText("Save").click();

  modal().within(() => {
    cy.button("Save").click();
    cy.wait("@saveQuestion");
  });

  modal().findByText("Not now").click();
}
