export function createSnippet({
  name,
  content,
}: {
  name: string;
  content: string;
}) {
  cy.request("POST", "/api/native-query-snippet", {
    name,
    content,
  });
}
