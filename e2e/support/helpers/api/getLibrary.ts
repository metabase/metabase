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

export const getLibrary = (): Cypress.Chainable<
  Cypress.Response<LibraryResponse>
> => {
  cy.log("Wait for library");

  return retryRequest(
    () => cy.request<LibraryResponse>("GET", "/api/ee/library"),
    ({ body }) => "name" in body,
  ).then((response) =>
    retryRequest(
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
    ).then(() => response),
  );
};
