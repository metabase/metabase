import type {
  Collection,
  CollectionId,
  CollectionType,
  ListCollectionItemsResponse,
} from "metabase-types/api";

export type LibraryCollectionIds = {
  libraryCollectionId: CollectionId;
  dataCollectionId: CollectionId;
  metricsCollectionId: CollectionId;
  dashboardsCollectionId: CollectionId;
};

export function createLibrary(): Cypress.Chainable<LibraryCollectionIds> {
  return cy
    .request<Collection>("POST", "/api/ee/library")
    .then(({ body: library }) =>
      cy
        .request<ListCollectionItemsResponse>(
          "GET",
          `/api/collection/${library.id}/items`,
          { models: "collection" },
        )
        .then(({ body: { data: children } }) => {
          const childId = (type: CollectionType): CollectionId => {
            const child = children.find((item) => item.type === type);
            if (child == null) {
              throw new Error(`The Library has no ${type} collection`);
            }
            return child.id;
          };

          return {
            libraryCollectionId: library.id,
            dataCollectionId: childId("library-data"),
            metricsCollectionId: childId("library-metrics"),
            dashboardsCollectionId: childId("library-dashboards"),
          };
        }),
    );
}
