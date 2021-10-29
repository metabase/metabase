import { restore, modal } from "__support__/e2e/cypress";

describe("scenarios > datasets", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows to turn a question into a dataset", () => {
    cy.visit("/question/1");
    turnIntoDataset();
    cy.findByText("Our analytics").click();
    getCollectionItemRow("Orders").within(() => {
      cy.icon("dataset");
    });
  });

  it("changes dataset's display to table", () => {
    cy.visit("/question/3");

    cy.get(".LineAreaBarChart");
    cy.get(".TableInteractive").should("not.exist");

    turnIntoDataset();

    cy.get(".TableInteractive");
    cy.get(".LineAreaBarChart").should("not.exist");
  });
});

function turnIntoDataset() {
  cy.findByTestId("saved-question-header-button").click();
  cy.icon("dataset").click();
  modal().within(() => {
    cy.button("Turn this into a dataset").click();
  });
}

function getCollectionItemRow(itemName) {
  return cy.findByText(itemName).closest("tr");
}
