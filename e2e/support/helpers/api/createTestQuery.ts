import type {
  OpaqueDatasetQuery,
  QuerySpecWithDatabase,
} from "metabase-types/api";

export function createTestQuery(
  querySpec: QuerySpecWithDatabase,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return cy
    .request<OpaqueDatasetQuery>("POST", "/api/testing/query", querySpec)
    .then(({ body }) => body);
}
