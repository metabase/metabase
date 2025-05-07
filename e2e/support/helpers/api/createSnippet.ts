export function createSnippet({
  name,
  content,
}: {
  name: string;
  content: string;
}): Cypress.Chainable<Cypress.Response<NativeQuerySnippet>> {
  cy.request("POST", "/api/native-query-snippet", {
    name,
    content,
  });
}
