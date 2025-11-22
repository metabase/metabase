import type { Collection } from "metabase-types/api";

type LibraryResponse = Collection & {
  effective_children?: Collection[];
};

export const createLibrary = (): Cypress.Chainable<
  Cypress.Response<LibraryResponse>
> => {
  cy.log("Initialize library");

  return cy
    .request("POST", "/api/ee/library")
    .then(() => cy.request<LibraryResponse>("GET", "/api/ee/library"));
};
