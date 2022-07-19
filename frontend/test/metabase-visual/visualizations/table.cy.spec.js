import { restore, openReviewsTable, modal } from "__support__/e2e/helpers";

describe("visual tests > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.viewport(1600, 860);
    cy.signInAsNormalUser();

    openReviewsTable();

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("ad-hoc with long column trimmed", () => {
    cy.percySnapshot();
  });

  it("ad-hoc with long column expanded", () => {
    cy.findAllByTestId("expand-column").eq(0).click({ force: true });

    cy.percySnapshot();
  });

  it("saved", () => {
    saveQuestion();
    cy.percySnapshot();
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
