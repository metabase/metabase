import type { BulkTableRequest } from "metabase-types/api";

export const unpublishTables = (request: BulkTableRequest) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/unpublish-tables",
    request,
  );
};
