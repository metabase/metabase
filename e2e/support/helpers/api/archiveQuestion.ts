import type { Card } from "metabase-types/api";

export const archiveQuestion = (
  id: Card["id"],
): Cypress.Chainable<Cypress.Response<Card>> => {
  cy.log(`Archiving a question with id: ${id}`);

  return cy.request<Card>("PUT", `/api/card/${id}`, {
    archived: true,
  });
};
