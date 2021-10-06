import { restore } from "__support__/e2e/cypress";

const QUESTION_NAME = "Foo";

describe.skip("issue 9027", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();

    // Wait for the existing questions to load
    cy.findByText("Orders");

    cy.icon("sql").click();

    cy.get(".ace_content").type("select 0");
    cy.get(".NativeQueryEditor .Icon-play").click();

    saveQuestion(QUESTION_NAME);
  });

  it("should display newly saved question in the 'Saved Questions' list immediately (metabase#9027)", () => {
    cy.findByText("Ask a question").click();
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();

    cy.findByText(QUESTION_NAME);
  });
});

function saveQuestion(name) {
  cy.findByText("Save").click();
  cy.findByLabelText("Name").type(name);
  cy.button("Save").click();
  cy.button("Not now").click();
}
