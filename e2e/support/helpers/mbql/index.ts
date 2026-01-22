import type * as Lib from "metabase-lib";
import type { CreateTestQueryOpts } from "metabase-lib/test-helpers";
import type { DatabaseId } from "metabase-types/api";

import type { GetMetadataOpts } from "./types";

export async function getMetadataProvider(
  opts?: GetMetadataOpts,
): Promise<Lib.MetadataProvider> {
  const { getMetadataProvider } = await import("./metadata-provider");
  return getMetadataProvider(opts);
}

export async function createTestJsQuery(
  metadataProvider: Lib.MetadataProvider,
  opts: CreateTestQueryOpts,
) {
  const { createTestJsQuery } = await import("metabase-lib/test-helpers");
  return createTestJsQuery(metadataProvider, opts);
}

export async function createTestNativeJsQuery(
  metadataProvider: Lib.MetadataProvider,
  databaseId: DatabaseId,
  query: string,
) {
  const { createTestNativeJsQuery } = await import("metabase-lib/test-helpers");
  return createTestNativeJsQuery(metadataProvider, databaseId, query);
}
