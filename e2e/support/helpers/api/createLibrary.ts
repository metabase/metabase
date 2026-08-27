import type { Collection } from "metabase-types/api";

import { retryRequest } from "../e2e-request-helpers";

type LibraryResponse = Collection & {
  effective_children?: Collection[];
};

const hasLibraryRootCollections = (collections: Collection[]) => {
  const libraryCollection = collections.find(({ type }) => type === "library");

  return Boolean(
    libraryCollection?.children?.some(({ type }) => type === "library-data") &&
    libraryCollection?.children?.some(({ type }) => type === "library-metrics"),
  );
};

export const createLibrary = (): Cypress.Chainable<
  Cypress.Response<LibraryResponse>
> => {
  cy.log("Initialize library");

  return cy
    .request("POST", "/api/ee/library")
    .then(() => cy.request<LibraryResponse>("GET", "/api/ee/library"))
    .then((response) => {
      return retryRequest(
        () =>
          cy.request<Collection[]>({
            method: "GET",
            url: "/api/collection/tree",
            qs: {
              "exclude-other-user-collections": true,
              "exclude-archived": true,
              "include-library": true,
            },
          }),
        ({ body }) => hasLibraryRootCollections(body),
      ).then(() => response);
    });
};
