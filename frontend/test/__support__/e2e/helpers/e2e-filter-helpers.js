import {
  modal,
  popover,
} from "__support__/e2e/helpers/e2e-ui-elements-helpers";

export function setFilterQuestionSource({ question, field }) {
  cy.findByText("Dropdown list").click();
  cy.findByText("Edit").click();

  modal().within(() => {
    cy.findByText("From another model or question").click();
    cy.findByText("Pick a model or question…").click();
  });

  modal().within(() => {
    cy.findByPlaceholderText(/Search for a question/).type(question);
    cy.findByText(question).click();
    cy.button("Done").click();
  });

  modal().within(() => {
    cy.findByText("Pick a column…").click();
  });

  popover().within(() => {
    cy.findByText(field).click();
  });

  modal().within(() => {
    cy.button("Done").click();
  });
}

export function setFilterListSource({ values }) {
  cy.findByText("Dropdown list").click();
  cy.findByText("Edit").click();

  modal().within(() => {
    cy.findByText("Custom list").click();
    cy.findByRole("textbox").clear().type(values.join("\n"));
    cy.button("Done").click();
  });
}
