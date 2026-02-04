import * as ML from "cljs/metabase.lib_metric.js";

import type { MetadataProvider } from "../types";
import type Metadata from "../v1/metadata/Metadata";

// Type assertion for CLJS exports - the actual exports are defined in lib_metric/js.cljs
// TypeScript will see these after CLJS recompilation
const LibMetric = ML as {
  metadataProvider: (metadata: Metadata) => MetadataProvider;
};

/**
 * Create a MetricMetadataProvider from Redux metadata.
 *
 * This provider enables building metric queries that span multiple databases.
 * Unlike the standard Lib.metadataProvider which is scoped to a single database,
 * this provider has no single database context and routes requests based on
 * table-id.
 *
 * @param metadata - Metadata object (same format as passed to Lib.metadataProvider)
 * @returns A MetadataProvider that routes requests to the appropriate database provider
 */
export function metadataProvider(metadata: Metadata): MetadataProvider {
  return LibMetric.metadataProvider(metadata);
}
