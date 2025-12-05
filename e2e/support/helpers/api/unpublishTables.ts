import type { BulkTableSelection } from "metabase-types/api";

export const unpublishTables = (request: BulkTableSelection) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/unpublish-tables",
    request,
  );
};
