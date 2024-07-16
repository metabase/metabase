import type { CollectionId } from "metabase-types/api";

export const createCollection = ({
  name,
  description = null,
  parent_id = null,
  authority_level = null,
}: {
  name: string;
  description?: string | null;
  parent_id?: CollectionId | null;
  authority_level?: "official" | null;
}) => {
  cy.log(`Create a collection: ${name}`);

  return cy.request("POST", "/api/collection", {
    name,
    description,
    parent_id,
    authority_level,
  });
};

export const archiveCollection = (id: CollectionId) => {
  cy.log(`Archiving a collection with id: ${id}`);

  return cy.request("PUT", `/api/collection/${id}`, {
    archived: true,
  });
};
