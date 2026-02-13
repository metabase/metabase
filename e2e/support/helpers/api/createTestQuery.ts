import type {
  OpaqueDatasetQuery,
  TestNativeQuerySpecWithDatabase,
  TestQuerySpecWithDatabase,
} from "metabase-types/api";

export function createTestQuery(
  querySpec: TestQuerySpecWithDatabase,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return cy
    .request<OpaqueDatasetQuery>("POST", "/api/testing/query", querySpec)
    .then(({ body }) => body);
}

export function createTestNativeQuery(
  nativeQuerySpec: TestNativeQuerySpecWithDatabase,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return cy
    .request<OpaqueDatasetQuery>(
      "POST",
      "/api/testing/native-query",
      nativeQuerySpec,
    )
    .then(({ body }) => body);
}
