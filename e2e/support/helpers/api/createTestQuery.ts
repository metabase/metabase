import type {
  OpaqueDatasetQuery,
  TestQuerySpecWithDatabase,
} from "metabase-types/api";

export function createTestQuery(
  querySpec: TestQuerySpecWithDatabase,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return cy
    .request<OpaqueDatasetQuery>("POST", "/api/testing/query", querySpec)
    .then(({ body }) => body);
}
