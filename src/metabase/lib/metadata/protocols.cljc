(ns metabase.lib.metadata.protocols
  (:require
   #?@(:clj [[potemkin :as p]])
   [medley.core :as m]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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
    "Return active (non-archived) metadatas associated with a particular Table, either Fields, Metrics, or
  Segments -- `metadata-type` must be one of either `:metadata/column`, `:metadata/metric`, or `:metadata/segment`.")

  (metadatas-for-card [metadata-provider metadata-type card-id]
    "Return active (non-archived) metadatas associated with a particular Card, currently only Metrics, so
  `metadata-type` must be `:metadata/metric`.")

  (setting [metadata-provider setting-key]
    "Return the value of the given Metabase setting with keyword `setting-name`."))

(defn metadata-provider?
  "Whether `x` is a valid [[MetadataProvider]]."
  [x]
  #?(:clj (extends? MetadataProvider (class x))
     :cljs (satisfies? MetadataProvider x)))

(mr/def ::metadata-provider
  "Schema for something that satisfies the [[metabase.lib.metadata.protocols/MetadataProvider]] protocol."
  [:fn
   {:error/message "Valid MetadataProvider"}
   #'metadata-provider?])

(defn metadata-providerable?
  "Whether `x` is a [[metadata-provider?]], or has one attached at `:lib/metadata` (i.e., a query)."
  [x]
  (or (metadata-provider? x)
      (some-> x :lib/metadata metadata-providerable?)))

(mr/def ::metadata-providerable
  "Something that can be used to get a MetadataProvider. Either a MetadataProvider, or a map with a MetadataProvider in
  the key `:lib/metadata` (i.e., a query)."
  [:fn
   {:error/message "Valid MetadataProvider, or a map with a MetadataProvider in the key :lib/metadata (i.e. a query)"}
   #'metadata-providerable?])

(mr/def ::metadata-type-excluding-database
  "Database metadata is stored separately/in a special way. These are the types of metadata that are stored with the
  other non-Database methods."
  [:enum :metadata/table :metadata/column :metadata/card :metadata/segment])

(mr/def ::metadata
  [:map
   [:lib/type ::metadata-type-excluding-database]
   [:id       pos-int?]])

(mu/defn- metadata :- [:maybe ::metadata]
  [metadata-provider :- ::metadata-provider
   metadata-type     :- ::metadata-type-excluding-database
   metadata-id       :- pos-int?]
  (m/find-first (fn [object]
                  (= (:id object) metadata-id))
                (metadatas metadata-provider metadata-type [metadata-id])))

(mu/defn table :- [:maybe ::lib.schema.metadata/table]
  "Return metadata for a specific Table. Metadata should satisfy `:metabase.lib.schema.metadata/table`."
  [metadata-provider :- ::metadata-provider
   table-id          :- ::lib.schema.id/table]
  (metadata metadata-provider :metadata/table table-id))

(mu/defn field :- [:maybe ::lib.schema.metadata/column]
  "Return metadata for a specific Field. Metadata should satisfy `:metabase.lib.schema.metadata/column`."
  [metadata-provider :- ::metadata-provider
   field-id          :- ::lib.schema.id/field]
  (metadata metadata-provider :metadata/column field-id))

(mu/defn card :- [:maybe ::lib.schema.metadata/card]
  "Return information about a specific Saved Question, aka a Card. This should match
  `:metabase.lib.schema.metadata/card`. Currently just used for display name purposes if you have a Card as a source
  query."
  [metadata-provider :- ::metadata-provider
   card-id           :- ::lib.schema.id/card]
  (metadata metadata-provider :metadata/card card-id))

(mu/defn segment :- [:maybe ::lib.schema.metadata/segment]
  "Return metadata for a particular captial-S Segment, i.e. something from the `segment` table in the application
  database. Metadata should match `:metabase.lib.schema.metadata/segment`."
  [metadata-provider :- ::metadata-provider
   segment-id        :- ::lib.schema.id/segment]
  (metadata metadata-provider :metadata/segment segment-id))

(mu/defn fields :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Return a sequence of Fields associated with a Table with the given `table-id`. Fields should satisfy
  the `:metabase.lib.schema.metadata/column` schema. If no such Table exists, this should error."
  [metadata-provider :- ::metadata-provider
   table-id          :- ::lib.schema.id/table]
  (metadatas-for-table metadata-provider :metadata/column table-id))

(mu/defn segments :- [:maybe [:sequential ::lib.schema.metadata/segment]]
  "Return a sequence of legacy Segments associated with a Table with the given `table-id`. Segments should satisfy
  the `:metabase.lib.schema.metadata/segment` schema. If no Table with ID `table-id` exists, this should error."
  [metadata-provider :- ::metadata-provider
   table-id          :- ::lib.schema.id/table]
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
   #?(:clj (extends? CachedMetadataProvider (class x))
      :cljs (satisfies? CachedMetadataProvider x)))

(mr/def ::cached-metadata-provider
  [:fn
   {:error/message "A CachedMetadataProvider"}
   #'cached-metadata-provider?])

(mu/defn store-metadatas!
  "Convenience. Store several metadata maps at once."
  [cached-metadata-provider :- ::cached-metadata-provider
   objects                  :- [:maybe [:sequential ::metadata]]]
  (doseq [object objects]
    (store-metadata! cached-metadata-provider object)))

(mu/defn cached-metadata :- [:maybe ::metadata]
  "Get cached metadata of a specific type, e.g. `:metadata/table`."
  [cached-metadata-provider :- ::cached-metadata-provider
   metadata-type            :- ::metadata-type-excluding-database
   id                       :- pos-int?]
  (m/find-first (fn [object]
                  (= (:id object) id))
                (cached-metadatas cached-metadata-provider metadata-type [id])))

;;; this is done for side-effects, but it's thread-safe and safe inside STM transactions, you can call it a hundred
;;; times with no ill effects.
;;;
;;; TODO -- we don't really use metadata providers across threads but I'm wondering whether the cached metadata
;;; provider should have some sort of internal lock so 100 simultaneous calls to fetch an object only results in a
;;; single call to the underlying ApplicationDatabaseMetadataProvider... Fetch stuff already present in the cache
;;; without needing a lock, but if we need to fetch something from the parent provider wait for a lock to do it.
;;; -- Cam
(mu/defn warm-cache
  "Convenience for warming a `CachedMetadataProvider` for side-effects. Checks whether the provider is a cached
  metadata provider, and, if it is, calls [[metadatas]] to fetch the objects in question and warm the cache."
  [metadata-provider :- ::metadata-provider
   metadata-type     :- ::metadata-type-excluding-database
   object-ids        :- [:maybe
                         [:or
                          [:set pos-int?]
                          [:sequential pos-int?]]]]
  (when (and (cached-metadata-provider? metadata-provider)
             (seq object-ids))
    (metadatas metadata-provider metadata-type object-ids)))

(#?(:clj p/defprotocol+ :cljs defprotocol) InvocationTracker
  "Optional. A protocol for a MetadataProvider that records the arguments of method invocations during query execution.
  This is useful for tracking which metdata ids were used during a query execution. The main purpose of this is to power
  updating card.last_used_at during query execution. see [[metabase.query-processor.middleware.update-used-cards/update-used-cards!]]"
  (invoked-ids [this metadata-type]
    "Get all invoked ids of a metadata type thus far."))
