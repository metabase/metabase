import type { Collection, RegularCollectionId } from "metabase-types/api";

export const createCollection = ({
  name,
  description = null,
  parent_id = null,
  authority_level = null,
}: {
  name: string;
  description?: string | null;
  parent_id?: RegularCollectionId | null;
  authority_level?: "official" | null;
}): Cypress.Chainable<Cypress.Response<Collection>> => {
  cy.log(`Create a collection: ${name}`);

  return cy.request("POST", "/api/collection", {
    name,
    description,
    parent_id,
    authority_level,
  });
};
