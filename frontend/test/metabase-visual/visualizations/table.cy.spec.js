import { restore, openOrdersTable, modal } from "__support__/e2e/cypress";

describe("visual tests > visualizations > table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("ad-hoc", () => {
    openOrdersTable();
    cy.wait("@dataset");
    cy.percySnapshot();
  });

  it("saved", () => {
    openOrdersTable();
    cy.wait("@dataset");
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
