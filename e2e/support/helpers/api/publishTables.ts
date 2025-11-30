import type { PublishTablesRequest } from "metabase-types/api";

export const publishTables = (request: PublishTablesRequest) => {
  return cy.request("POST", "/api/ee/data-studio/table/publish-table", request);
};
