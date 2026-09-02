/**
 * The public face of the metadata mirror.
 *
 * `state.entities` holds one normalized record per database, table, field and
 * so on, merged from many endpoints. Everything outside this folder reads it
 * through the selectors below, and `metabase/enforce-module-public-api` rejects
 * a deeper import.
 *
 * `getMetadata` builds the metabase-lib v1 `Metadata` object. It is the input
 * format the CLJS provider parses, so it stays until that provider does.
 */
export type { MetadataSelectorOpts } from "./selectors";
export {
  getMetadata,
  getMetadataUnfiltered,
  getMetadataWithHiddenTables,
  getShallowDatabases,
  getShallowFields,
  getShallowSegments,
  getShallowTables,
} from "./selectors";
