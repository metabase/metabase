import type { BulkTableRequest, Collection } from "metabase-types/api";

type LibraryResponse = Collection & {
  effective_children?: Collection[];
};

export const publishTables = (request: BulkTableRequest) => {
  if (request.collection_id != null) {
    return requestPublishTables(request);
  }

  return cy
    .request<LibraryResponse>("GET", "/api/ee/library")
    .then(({ body }) => {
      const dataCollection = body.effective_children?.find(
        (collection) => collection.type === "library-data",
      );

      return requestPublishTables({
        ...request,
        collection_id: dataCollection?.id as number,
      });
    });
};

const requestPublishTables = (request: BulkTableRequest) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/publish-tables",
    request,
  );
};
