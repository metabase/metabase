import type {
  OpaqueDatasetQuery,
  QuerySpecWithDatabase,
} from "metabase-types/api";

export function createQueryFromSpec(
  querySpec: QuerySpecWithDatabase,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return cy
    .request<OpaqueDatasetQuery>(
      "POST",
      "/api/testing/query-from-spec",
      querySpec,
    )
    .then(({ body }) => body);
}
