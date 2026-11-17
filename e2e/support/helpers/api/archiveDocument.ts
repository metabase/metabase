import type { Document, DocumentId } from "metabase-types/api";

export const archiveDocument = (
  id: DocumentId,
): Cypress.Chainable<Cypress.Response<Document>> => {
  cy.log(`Archiving a document with id: ${id}`);

  return cy.request<Document>("PUT", `/api/document/${id}`, {
    archived: true,
  });
};
