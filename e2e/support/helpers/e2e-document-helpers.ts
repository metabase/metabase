export const documentContent = () => cy.findByTestId("document-content");

export const addToDocument = (text: string, newLine: boolean = true) => {
  cy.realType(`${text}`);
  if (newLine) {
    cy.realType("{enter}");
  }
};

export const documentSuggestionDialog = () =>
  cy.findByRole("dialog", { name: "Mention Dialog" });

export const documentSuggestionItem = (name: string) =>
  documentSuggestionDialog().findByRole("listitem", { name });

export const commandSuggestionDialog = () =>
  cy.findByRole("dialog", { name: "Command Dialog" });

export const commandSuggestionItem = (name: string) =>
  commandSuggestionDialog().findByRole("listitem", { name });
