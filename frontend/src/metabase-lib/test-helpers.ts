/* istanbul ignore file */

import {
  SAMPLE_DATABASE,
  metadata as SAMPLE_METADATA,
} from "__support__/sample_database_fixture";
import type { DatabaseId, DatasetQuery } from "metabase-types/api";
import type Metadata from "./metadata/Metadata";
import * as ML from "./v2";

export { SAMPLE_DATABASE, SAMPLE_METADATA };

type MetadataProviderOpts = {
  databaseId?: DatabaseId;
  metadata?: Metadata;
};

function createMetadataProvider({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
}: MetadataProviderOpts = {}) {
  return ML.metadataProvider(databaseId, metadata);
}

export const DEFAULT_QUERY: DatasetQuery = {
  database: SAMPLE_DATABASE.id,
  type: "query",
  query: {
    "source-table": SAMPLE_DATABASE.ORDERS.id,
  },
};

type QueryOpts = MetadataProviderOpts & {
  query?: DatasetQuery;
};

export function createQuery({
  databaseId = SAMPLE_DATABASE.id,
  metadata = SAMPLE_METADATA,
  query = DEFAULT_QUERY,
}: QueryOpts = {}) {
  const metadataProvider = createMetadataProvider({ databaseId, metadata });
  return ML.fromLegacyQuery(databaseId, metadataProvider, query);
}
