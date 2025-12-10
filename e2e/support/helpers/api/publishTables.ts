import type { BulkTableSelection } from "metabase-types/api";

export const publishTables = (request: BulkTableSelection) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/publish-tables",
    request,
  );
};
