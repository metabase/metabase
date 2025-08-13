export const documentContent = () => cy.findByTestId("document-content");

export const documentFormattingMenu = () =>
  cy.findByTestId("document-formatting-menu");

export const addToDocument = (text: string, newLine: boolean = true) => {
  cy.realType(text);
  if (newLine) {
    cy.realType("{enter}");
  }
};

export const documentSuggestionDialog = () =>
  cy.findByRole("dialog", { name: "Mention Dialog" });

export const documentSuggestionItem = (name: RegExp | string) =>
  documentSuggestionDialog().findByRole("option", { name });

export const commandSuggestionDialog = () =>
  cy.findByRole("dialog", { name: "Command Dialog" });

export const commandSuggestionItem = (name: RegExp | string) =>
  commandSuggestionDialog().findByRole("option", { name });

export const getDocumentCard = (name: string) =>
  documentContent()
    .findAllByTestId("document-card-embed")
    .contains('[data-testid="document-card-embed"]', name);

export const assertDocumentCardVizType = (name: string, type: string) =>
  getDocumentCard(name).find(`[data-viz-ui-name=${type}]`);

export const getDocumentSidebar = () =>
  cy.findByTestId("document-card-sidebar");

export const openDocumentCardMenu = (name: string) => {
  getDocumentCard(name)
    .findByRole("button", { name: /ellipsis/ })
    .click();
};
