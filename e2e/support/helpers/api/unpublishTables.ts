import type { UnpublishTablesRequest } from "metabase-types/api";

export const unpublishTables = (request: UnpublishTablesRequest) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/unpublish-table",
    request,
  );
};
