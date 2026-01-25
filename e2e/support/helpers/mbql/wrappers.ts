import type * as Lib from "metabase-lib";
import type { CreateTestQueryOpts } from "metabase-lib/test-helpers";
import type { DatabaseId, OpaqueDatasetQuery } from "metabase-types/api";

import type { GetMetadataOpts } from "./types";

/**
 * Returns a Lib.MetadataProvider instance containing metadata for the
 * entities defined in opts.
 *
 * @param opts.databaseId - The database to fetch metadata for
 * @param opts.tableIds - The tables to fetch metadata for
 * @param opts.cardIds - Cards to fetch metadata for
 */
export function getMetadataProvider(
  opts?: GetMetadataOpts,
): Cypress.Chainable<Lib.MetadataProvider> {
  return (
    cy
      // we need to log in before we can get metadata
      .getCookie("metabase.SESSION_ID")
      .then(() => _getMetadataProvider({ ...opts }))
  );
}

// Helper function which calls getMetadataProvider from ./metadata-provider
// This module needs to imported lazily not to crash Cypress and to avoid importing
// cljs in tests that don't need it.
async function _getMetadataProvider(
  opts?: GetMetadataOpts,
): Promise<Lib.MetadataProvider> {
  const { getMetadataProvider } = await import("./metadata-provider");
  return getMetadataProvider(opts);
}

/**
 * Build an MBQL query using a custom DSL that simplifies field selection and creation.
 *
 * @param metadataProvider - A Lib.MetadataProvider instance or a GetMetadataOpts object that will be user to instantiate a Lib.MetadataProvider
 * @param opts - The details of the query to create
 */
export function createQuery(
  metadataProvider: Lib.MetadataProvider | GetMetadataOpts,
  opts: CreateTestQueryOpts,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return ensureProvider(metadataProvider).then((provider) => {
    return createTestJsQuery(provider, opts);
  });
}

// Helper function which calls createTestJsQuery from metabase-lib/test-helpers.
// This module needs to imported lazily not to crash Cypress and to avoid importing
// cljs in tests that don't need it.
async function createTestJsQuery(
  metadataProvider: Lib.MetadataProvider,
  opts: CreateTestQueryOpts,
): Promise<OpaqueDatasetQuery> {
  const { createTestJsQuery } = await import("metabase-lib/test-helpers");
  return createTestJsQuery(metadataProvider, opts);
}

/**
 * Build a native MBQL query using a custom DSL that simplifies field selection and creation.
 *
 * @param metadataProvider - A Lib.MetadataProvider instance or a GetMetadataOpts object that will be user to instantiate a Lib.MetadataProvider
 * @param databaseId - The database the query is for
 * @param query - The native query string
 */
export function createNativeQuery(
  metadataProvider: Lib.MetadataProvider | GetMetadataOpts,
  databaseId: DatabaseId,
  query: string,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return ensureProvider(metadataProvider).then((provider) =>
    createTestNativeJsQuery(provider, databaseId, query),
  );
}

// Helper function which calls createTestNativeJsQuery from metabase-lib/test-helpers.
// This module needs to imported lazily not to crash Cypress and to avoid importing
// cljs in tests that don't need it.
async function createTestNativeJsQuery(
  metadataProvider: Lib.MetadataProvider,
  databaseId: DatabaseId,
  query: string,
) {
  const { createTestNativeJsQuery } = await import("metabase-lib/test-helpers");
  return createTestNativeJsQuery(metadataProvider, databaseId, query);
}

function ensureProvider(
  providerOrOpts: GetMetadataOpts | Lib.MetadataProvider,
): Cypress.Chainable<Lib.MetadataProvider> {
  return isMetadataProvider(providerOrOpts)
    ? cy.wrap(providerOrOpts)
    : getMetadataProvider(providerOrOpts);
}

function isMetadataProvider(
  opts: GetMetadataOpts | Lib.MetadataProvider,
): opts is Lib.MetadataProvider {
  return "cache" in opts;
}
