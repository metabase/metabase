import { restore, openOrdersTable, modal } from "__support__/e2e/cypress";

describe("visual tests > visualizations > table", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsNormalUser();

    openOrdersTable();
    cy.wait("@dataset");
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
  cy.findByText("Save").click();
  modal().within(() => {
    cy.button("Save").click();
  });
  modal()
    .findByText("Not now")
    .click();
}
