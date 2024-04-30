(ns metabase.lib.metadata.protocols
  (:require
   #?@(:clj [[potemkin :as p]])
   [medley.core :as m]))

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

  (metadatas [metadata-provider metadata-type metadata-ids]
    "Return a sequence of non-nil metadata objects of `metadata-type` associated with `metadata-ids`, which is either
 a sequence or set of integer object IDs. Objects should be fetched as needed, but if this MetadataProvider has an
 internal cache (i.e., if it is a [[CachedMetadataProvider]]), it should return any cached objects and only fetch ones
 not present in the cache. This should not error if any objects were not found. The order objects are returned in does
 not matter. For MetadataProviders that have a cache, calling this method can be done for side-effects (to warm the
 cache).")

  (tables [metadata-provider]
    "Return a sequence of Tables in this Database. Tables should satisfy the `:metabase.lib.schema.metadata/table`
  schema. This should also include things that serve as 'virtual' tables, e.g. Saved Questions or Models. But users of
  MLv2 should not need to know that! If we add support for Super Models or Quantum Questions in the future, they can
  just come back from this method in the same shape as everything else, the Query Builder can display them, and the
  internals can be tucked away here in MLv2.")

  (metadatas-for-table [metadata-provider metadata-type table-id]
    "Return active (non-archived) metadatas associated with a particular Table, either Fields, LegacyMetrics, or
  Segments -- `metadata-type` must be one of either `:metadata/column`, `:metadata/legacy-metric`, or
  `:metadata/segment`.")

  (setting [metadata-provider setting-key]
    "Return the value of the given Metabase setting with keyword `setting-name`."))

(defn metadata-provider?
  "Whether `x` is a valid [[MetadataProvider]]."
  [x]
  (satisfies? MetadataProvider x))

(defn metadata-providerable?
  "Whether `x` is a [[metadata-provider?]], or has one attached at `:lib/metadata` (i.e., a query)."
  [x]
  (or (metadata-provider? x)
      (some-> x :lib/metadata metadata-providerable?)))

(defn- metadata [metadata-provider metadata-type metadata-id]
  (m/find-first (fn [object]
                  (= (:id object) metadata-id))
                (metadatas metadata-provider metadata-type [metadata-id])))

(defn table
  "Return metadata for a specific Table. Metadata should satisfy [[metabase.lib.metadata/TableMetadata]]."
  [metadata-provider table-id]
  (metadata metadata-provider :metadata/table table-id))

(defn field
  "Return metadata for a specific Field. Metadata should satisfy [[metabase.lib.metadata/ColumnMetadata]]."
  [metadata-provider field-id]
  (metadata metadata-provider :metadata/column field-id))

(defn card
  "Return information about a specific Saved Question, aka a Card. This should
  match [[metabase.lib.metadata/CardMetadata]. Currently just used for display name purposes if you have a Card as a
  source query."
  [metadata-provider card-id]
  (metadata metadata-provider :metadata/card card-id))

(defn legacy-metric
  "Return metadata for a particular capital-M Metric, i.e. something from the `metric` table in the application
  database. Metadata should match [[metabase.lib.metadata/LegacyMetricMetadata]]."
  [metadata-provider legacy-metric-id]
  (metadata metadata-provider :metadata/legacy-metric legacy-metric-id))

(defn segment
  "Return metadata for a particular captial-S Segment, i.e. something from the `segment` table in the application
  database. Metadata should match [[metabase.lib.metadata/SegmentMetadata]]."
  [metadata-provider segment-id]
  (metadata metadata-provider :metadata/segment segment-id))

(defn fields
  "Return a sequence of Fields associated with a Table with the given `table-id`. Fields should satisfy
  the [[metabase.lib.metadata/ColumnMetadata]] schema. If no such Table exists, this should error."
  [metadata-provider table-id]
  (metadatas-for-table metadata-provider :metadata/column table-id))

(defn legacy-metrics
  "Return a sequence of legacy Metrics associated with a Table with the given `table-id`. Metrics should satisfy
  the [[metabase.lib.metadata/LegacyMetricMetadata]] schema. If no such Table exists, this should error."
  [metadata-provider table-id]
  (metadatas-for-table metadata-provider :metadata/legacy-metric table-id))

(defn segments
  "Return a sequence of legacy Segments associated with a Table with the given `table-id`. Segments should satisfy
  the [[metabase.lib.metadata/SegmentMetadata]] schema. If no Table with ID `table-id` exists, this should error."
  [metadata-provider table-id]
  (metadatas-for-table metadata-provider :metadata/segment table-id))

(#?(:clj p/defprotocol+ :cljs defprotocol) CachedMetadataProvider
  "Optional. A protocol for a MetadataProvider that some sort of internal cache. This is mostly useful for
  MetadataProviders that can hit some sort of relatively expensive external service,
  e.g. [[metabase.lib.metadata.jvm/application-database-metadata-provider]]. The main purpose of this is to allow
  pre-warming the cache with stuff that was already fetched elsewhere.
  See [[metabase.models.metric/warmed-metadata-provider]] for example.

  See [[metabase.lib.metadata.cached-provider/cached-metadata-provider]] for a way to wrap an existing
  MetadataProvider to add caching on top of it."
  (cached-metadatas [cached-metadata-provider metadata-type metadata-ids]
    "Like [[metadatas]], but only return metadata that is already present in the cache.")
  (store-metadata! [cached-metadata-provider object]
    "Store metadata of a specific type, e.g. `:metadata/table`."))

(defn cached-metadata-provider?
  "Whether `x` is a valid [[CachedMetadataProvider]]."
  [x]
  (satisfies? CachedMetadataProvider x))

(defn store-metadatas!
  "Convenience. Store several metadata maps at once."
  [cached-metadata-provider objects]
  (assert (cached-metadata-provider? cached-metadata-provider)
          (str "Not a CachedMetadataProvider: " (pr-str cached-metadata-provider)))
  (doseq [object objects]
    (store-metadata! cached-metadata-provider object)))

(defn cached-metadata
  "Get cached metadata of a specific type, e.g. `:metadata/table`."
  [cached-metadata-provider metadata-type metadata-id]
  (assert (cached-metadata-provider? cached-metadata-provider)
          (str "Not a CachedMetadataProvider: " (pr-str cached-metadata-provider)))
  (m/find-first (fn [object]
                  (= (:id object) metadata-id))
                (cached-metadatas cached-metadata-provider metadata-type [metadata-id])))
