// The module's public interface.
// Names absent here are module-private on purpose — add them only when a real
// consumer needs them. normalizr and the entity schemas stay inside: callers
// name the write they are making and the module picks the schema.

/**
 * `state.entities` holds one normalized record per database, table, field and
 * so on, merged from many endpoints.
 *
 * `getMetadata` builds the metabase-lib v1 `Metadata` object from them. That is
 * the input format the CLJS provider parses, so it stays until that does.
 */
export {
  getFieldRemappings,
  getMetadata,
  getMetadataUnfiltered,
  getMetadataWithHiddenTables,
  getShallowDatabases,
  getShallowFields,
  getShallowSegments,
  getShallowTables,
} from "./selectors";
export type { MetadataSelectorOpts } from "./selectors";

export { entitiesReducer } from "./reducer";

// The mirror's only writer. Every hydrating endpoint flows through it.
export { metadataHydrationMiddleware } from "./hydration";

// A field's remappings are accumulated on the client, not returned by any
// endpoint, so fetching and merging them lives with the store that holds them.
export { addRemappings, fetchRemapping } from "./remappings";

// Writes that no endpoint response covers, so a caller has to make them.
export {
  databaseFetched,
  fieldFetched,
  fieldRemappingsUpdated,
  paramFieldsFetched,
  tableFetched,
  tableForeignKeysFetched,
} from "./actions";
