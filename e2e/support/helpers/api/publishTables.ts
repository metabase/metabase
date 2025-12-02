import type { TableSelectors } from "metabase-types/api";

export const publishTables = (request: TableSelectors) => {
  return cy.request(
    "POST",
    "/api/ee/data-studio/table/publish-tables",
    request,
  );
};
