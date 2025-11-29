import type { Collection } from "metabase-types/api";

type LibraryResponse = Collection & {
  effective_children?: Collection[];
};

export type LibraryCollections = {
  library: Collection;
  data: Collection;
  metrics: Collection;
};

type CreateLibraryOptions = {
  wrapIds?: boolean;
};

export const createLibrary = (
  options?: CreateLibraryOptions,
): Cypress.Chainable<LibraryCollections> => {
  cy.log("Initialize library");

  return cy
    .request("POST", "/api/ee/library")
    .then(() => cy.request<LibraryResponse>("GET", "/api/ee/library"))
    .then((response) => {
      const library = response.body;
      const data = library.effective_children?.find(
        (child) => child.name === "Data",
      );
      const metrics = library.effective_children?.find(
        (child) => child.name === "Metrics",
      );

      if (!data || !metrics) {
        throw new Error("Library missing Data or Metrics collections");
      }

      const collections: LibraryCollections = { library, data, metrics };

      if (options?.wrapIds) {
        cy.wrap(library.id).as("libraryId");
        cy.wrap(data.id).as("dataCollectionId");
        cy.wrap(metrics.id).as("metricsCollectionId");
      }

      return cy.wrap(collections);
    });
};
