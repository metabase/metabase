import { restore, openOrdersTable, modal } from "__support__/e2e/helpers";

describe("visual tests > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    openOrdersTable();

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("ad-hoc", () => {
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

  modal()
    .findByText("Not now")
    .click();
}
