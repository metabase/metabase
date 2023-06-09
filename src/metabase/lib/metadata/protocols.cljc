(ns metabase.lib.metadata.protocols
  (:require
   #?@(:clj ([potemkin :as p]))))

(#?(:clj p/defprotocol+ :cljs defprotocol) MetadataProvider
  "Protocol for something that we can get information about Tables and Fields from. This can be provided in various ways
  various ways:

  1. By raw metadata attached to the query itself

  2. By the application database in Clj code

  3. By the Query Processor store in Clj code

  4. By the Redux store in JS

  5. By (hopefully cached) REST API calls

  This protocol is pretty limited at this point; in the future, we'll probably want to add:

  - methods for searching for Tables or Fields matching some string

  - paging, so if you have 10k Tables we don't do crazy requests that fetch them all at once

  For all of these methods: if no matching object can be found, you should generally return `nil` rather than throwing
  an Exception. Let [[metabase.lib.metadata]] worry about throwing exceptions."
  (database [metadata-provider]
    "Metadata about the Database we're querying. Should match the [[metabase.lib.metadata/DatabaseMetadata]] schema.
  This includes important info such as the supported `:features` and the like.")

  (table [metadata-provider table-id]
    "Return metadata for a specific Table. Metadata should satisfy [[metabase.lib.metadata/TableMetadata]].")

  (field [metadata-provider field-id]
    "Return metadata for a specific Field. Metadata should satisfy [[metabase.lib.metadata/ColumnMetadata]].")

  (card [metadata-provider card-id]
    "Return information about a specific Saved Question, aka a Card. This should
    match [[metabase.lib.metadata/CardMetadata]. Currently just used for display name purposes if you have a Card as a
    source query.")

  (metric [metadata-provider metric-id]
    "Return metadata for a particular capital-M Metric, i.e. something from the `metric` table in the application
    database. Metadata should match [[metabase.lib.metadata/MetricMetadata]].")

  (segment [metadata-provider segment-id]
    "Return metadata for a particular captial-S Segment, i.e. something from the `segment` table in the application
    database. Metadata should match [[metabase.lib.metadata/SegmentMetadata]]." )

  ;; these methods are only needed for using the methods BUILDING queries, so they're sort of optional I guess? Things
  ;; like the Query Processor, which is only manipulating already-built queries, shouldn't need to use these methods.
  ;; I'm on the fence about maybe putting these in a different protocol. They're part of this protocol for now tho so
  ;; implement them anyway.

  (tables [metadata-provider]
    "Return a sequence of Tables in this Database. Tables should satisfy the [[metabase.lib.metadata/TableMetadata]]
  schema. This should also include things that serve as 'virtual' tables, e.g. Saved Questions or Models. But users of
  MLv2 should not need to know that! If we add support for Super Models or Quantum Questions in the future, they can
  just come back from this method in the same shape as everything else, the Query Builder can display them, and the
  internals can be tucked away here in MLv2.")

  (fields [metadata-provider table-id]
    "Return a sequence of Fields associated with a Table with the given `table-id`. Fields should satisfy
  the [[metabase.lib.metadata/ColumnMetadata]] schema. If no such Table exists, this should error."))

(defn metadata-provider?
  "Whether `x` is a valid [[MetadataProvider]]."
  [x]
  (satisfies? MetadataProvider x))

(#?(:clj p/defprotocol+ :cljs defprotocol) CachedMetadataProvider
  "Optional. A protocol for a MetadataProvider that some sort of internal cache. This is mostly useful for
  MetadataProviders that can hit some sort of relatively expensive external service,
  e.g. [[metabase.lib.metadata.jvm/application-database-metadata-provider]]. The main purpose of this is to allow
  pre-warming the cache with stuff that was already fetched elsewhere.
  See [[metabase.models.metric/warmed-metadata-provider]] for example.

  See [[cached-metadata-provider]] below to wrap for a way to wrap an existing MetadataProvider to add caching on top
  of it."
  (cached-database [cached-metadata-provider]
    "Get cached metadata for the query's Database.")
  (cached-metadata [cached-metadata-provider metadata-type id]
    "Get cached metadata of a specific type, e.g. `:metadata/table`.")
  (store-database! [cached-metadata-provider database-metadata]
    "Store metadata for the query's Database.")
  (store-metadata! [cached-metadata-provider metadata-type id metadata]
    "Store metadata of a specific type, e.g. `:metadata/table`."))

(#?(:clj p/defprotocol+ :cljs defprotocol) BulkMetadataProvider
  "A protocol for a MetadataProvider that can fetch several objects in a single batched operation. This is mostly
  useful for MetadataProviders e.g. [[metabase.lib.metadata.jvm/application-database-metadata-provider]]."
  (bulk-metadata [bulk-metadata-provider metadata-type ids]
    "Fetch lots of metadata of a specific type, e.g. `:metadata/table`, in a single bulk operation."))

(defn store-metadatas!
  "Convenience. Store several metadata maps at once."
  [cached-metadata-provider metadata-type metadatas]
  (doseq [metadata metadatas]
    (store-metadata! cached-metadata-provider metadata-type (:id metadata) metadata)))
