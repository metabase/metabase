import type { CollectionId } from "metabase-types/api";

export const archiveCollection = (id: CollectionId) => {
  cy.log(`Archiving a collection with id: ${id}`);

  return cy.request("PUT", `/api/collection/${id}`, {
    archived: true,
  });
};
