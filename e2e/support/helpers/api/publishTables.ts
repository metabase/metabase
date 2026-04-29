import type { BulkTableSelection, Collection } from "metabase-types/api";

type LibraryResponse = Collection & {
  effective_children?: Collection[];
};

type PublishTablesRequest = BulkTableSelection & {
  collection_id?: number;
};

type RequiredPublishTablesRequest = BulkTableSelection & {
  collection_id: number;
};

export const publishTables = (request: PublishTablesRequest) => {
  if (request.collection_id != null) {
    return requestPublishTables(request as RequiredPublishTablesRequest);
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

const requestPublishTables = (request: RequiredPublishTablesRequest) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/publish-tables",
    request,
  );
};
