import type * as Lib from "metabase-lib";
import type { CreateTestQueryOpts } from "metabase-lib/test-helpers";
import type { DatabaseId, OpaqueDatasetQuery } from "metabase-types/api";

import type { GetMetadataOpts } from "./types";

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

export async function _getMetadataProvider(
  opts?: GetMetadataOpts,
): Promise<Lib.MetadataProvider> {
  const { getMetadataProvider } = await import("./metadata-provider");
  return getMetadataProvider(opts);
}

export function createTestJsQuery(
  metadataProvider: Lib.MetadataProvider | GetMetadataOpts,
  opts: CreateTestQueryOpts,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return getProvider(metadataProvider).then((provider) => {
    return _createTestJsQuery(provider, opts);
  });
}

export async function _createTestJsQuery(
  metadataProvider: Lib.MetadataProvider,
  opts: CreateTestQueryOpts,
): Promise<OpaqueDatasetQuery> {
  const { createTestJsQuery } = await import("metabase-lib/test-helpers");
  return createTestJsQuery(metadataProvider, opts);
}

export function createTestNativeJsQuery(
  metadataProvider: Lib.MetadataProvider | GetMetadataOpts,
  databaseId: DatabaseId,
  query: string,
): Cypress.Chainable<OpaqueDatasetQuery> {
  return getProvider(metadataProvider).then((provider) =>
    _createTestNativeJsQuery(provider, databaseId, query),
  );
}

export async function _createTestNativeJsQuery(
  metadataProvider: Lib.MetadataProvider,
  databaseId: DatabaseId,
  query: string,
) {
  const { createTestNativeJsQuery } = await import("metabase-lib/test-helpers");
  return createTestNativeJsQuery(metadataProvider, databaseId, query);
}

function isMetadataProvider(
  opts: GetMetadataOpts | Lib.MetadataProvider,
): opts is Lib.MetadataProvider {
  return "cache" in opts;
}

function getProvider(
  providerOrOpts: GetMetadataOpts | Lib.MetadataProvider,
): Cypress.Chainable<Lib.MetadataProvider> {
  if (isMetadataProvider(providerOrOpts)) {
    return cy.wrap(providerOrOpts);
  }
  return getMetadataProvider(providerOrOpts);
}
