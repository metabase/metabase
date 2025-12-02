import type { TableSelectors } from "metabase-types/api";

export const unpublishTables = (request: TableSelectors) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/unpublish-tables",
    request,
  );
};
