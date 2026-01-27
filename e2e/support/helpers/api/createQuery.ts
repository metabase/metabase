import type {
  OpaqueDatasetQuery,
  QuerySpecWithDatabase,
} from "metabase-types/api";

export function createQuery(
  querySpec: QuerySpecWithDatabase,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return cy
    .request<OpaqueDatasetQuery>("POST", "/api/testing/query", querySpec)
    .then(({ body }) => body);
}
