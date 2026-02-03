(ns metabase.lib.metadata.protocols
  (:require
   #?@(:clj [[potemkin :as p]])
   [medley.core :as m]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::metadata-type-excluding-database
  "Database metadata is stored separately/in a special way. These are the types of metadata that are stored with the
  other non-Database methods."
  [:enum :metadata/table :metadata/column :metadata/card :metadata/measure :metadata/metric :metadata/segment :metadata/native-query-snippet :metadata/transform])

(mr/def ::metadata-spec
  "Spec for fetching objects from a metadata provider. `:lib/type` is the type of the object to fetch, and the other
  keys in the spec are filters to restrict the resulting set of objects somehow.

  `:id` and `:name` are mutually exclusive.

  When fetching metadata that can be inactive/archived/hidden, only active/unarchived/unhidden objects are fetched
  unless `:id` or `:name` is specified.

  `:include-sensitive?` can be set to `true` to include Fields with `:visibility-type` `:sensitive` in the results."
  [:and
   [:map
    {:closed true}
    [:lib/type           [:ref ::metadata-type-excluding-database]]
    [:id                 {:optional true} [:set {:min 1} pos-int?]]
    [:name               {:optional true} [:set {:min 1} :string]]
    [:table-id           {:optional true} ::lib.schema.id/table]
    [:card-id            {:optional true} ::lib.schema.id/card]
    [:include-sensitive? {:optional true} :boolean]]
   [:fn
    {:error/message ":id and :name cannot be used at the same time."}
    (complement (every-pred :id :name))]
   [:fn
    {:error/message ":table-id is currently only supported for Fields, Measures, Metrics, and Segments."}
    (fn [spec]
      (or (not (:table-id spec))
          (#{:metadata/column :metadata/measure :metadata/metric :metadata/segment} (:lib/type spec))))]
   [:fn
    {:error/message ":card-id is currently only supported for Metrics."}
    (fn [spec]
      (or (not (:card-id spec))
          (#{:metadata/metric} (:lib/type spec))))]
   [:fn
    {:error/message "All metadata types except for :metadata/table and :metadata/transform must include at least one filter"}
    (some-fn :id :name :table-id :card-id #(= (:lib/type %) :metadata/table) #(= (:lib/type %) :metadata/transform))]])

(mu/defn default-spec-filter-xform
  "Create a `filter` transducer to a sequence of objects according to `metadata-spec`. Assumes objects are all the
  correct type already (i.e., does not filter by `:lib/type`). This powers the implementation of [[metadatas]] for
  metadata providers other than [[metabase.lib-be.metadata.jvm/application-database-metadata-provider]], which
  implements equivalent filter logic in SQL.

  This should match [[metabase.lib-be.metadata.jvm/metadata-spec->honey-sql]] as closely as
  possible."
  [{metadata-type :lib/type, id-set :id, name-set :name, :keys [table-id card-id include-sensitive?], :as _metadata-spec} :- ::metadata-spec]
  (let [active-only? (not (or id-set name-set))
        metric?      (= metadata-type :metadata/metric)
        preds        [(when id-set
                        #(contains? id-set (:id %)))
                      (when name-set
                        #(contains? name-set (:name %)))
                      (when table-id
                        #(= (:table-id %) table-id))
                      (when (and table-id metric?)
                        #(nil? (:source-card-id %)))
                      (when card-id
                        (if metric?
                          #(= (:source-card-id %) card-id)
                          #(= (:card-id %) card-id)))
                      (when active-only?
                        (case metadata-type
                          :metadata/table
                          #(and
                            (not (false? (:active %)))
                            (not (#{:hidden :technical :cruft} (:visibility-type %))))

                          :metadata/column
                          (let [excluded-visibility-types (cond-> #{:retired}
                                                            (not include-sensitive?) (conj :sensitive))]
                            #(and
                              (not (false? (:active %)))
                              (not (excluded-visibility-types (:visibility-type %)))))

                          (:metadata/card :metadata/measure :metadata/metric :metadata/segment)
                          #(not (:archived %))

                          #_else
                          nil))
                      (when metric?
                        #(= (:type %) :metric))]]
    (transduce
     (comp (filter some?)
           (map filter))
     comp
     identity
     preds)))

(#?(:clj p/defprotocol+ :cljs defprotocol) MetadataProvider
  "Protocol for something that we can get information about Tables and Fields
  from. This can be provided in various ways:

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

  (metadatas [metadata-provider metadata-spec]
    "Return a sequence of non-nil metadata objects matching `metadata-spec`, which must conform to the schema
  `:metabase.lib.metadata.protocols/metadata-spec`. Objects should be fetched as needed, but if this MetadataProvider
  has an internal cache (i.e., if it is a [[CachedMetadataProvider]]), it should return any cached objects and only
  fetch ones not present in the cache. This should not error if any objects were not found. The order objects are
  returned in does not matter. For MetadataProviders that have a cache, calling this method can be done for
  side-effects (to warm the cache).

  When fetching metadata that can be inactive/archived/hidden, only active/unarchived/unhidden objects are fetched
  unless `:id` or `:name` is specified.")

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
      (some-> x :lib/metadata metadata-providerable?)
      ;; function with the signature
      ;;
      ;;    (f database-id) => metadata-provider
      (fn? x)
      (var? x)))

(mr/def ::metadata-providerable
  "Something that can be used to get a MetadataProvider. Either a MetadataProvider, or a map with a MetadataProvider in
  the key `:lib/metadata` (i.e., a query)."
  [:fn
   {:error/message "Valid MetadataProvider, or a map with a MetadataProvider in the key :lib/metadata (i.e. a query)"}
   #'metadata-providerable?])

(mr/def ::metadata
  [:map
   [:lib/type ::metadata-type-excluding-database]
   [:id       pos-int?]])

(mu/defn- metadata-by-id :- [:maybe ::metadata]
  [metadata-provider :- ::metadata-provider
   metadata-type     :- ::metadata-type-excluding-database
   metadata-id       :- pos-int?]
  (first (metadatas metadata-provider {:lib/type metadata-type, :id #{metadata-id}})))

(mu/defn- metadatas-by-name :- [:maybe [:sequential ::metadata]]
  "Return a sequence of non-nil metadata objects of `metadata-type` associated with `names`, which is either
  a sequence or a set of string names. Objects should be fetched as needed, but if this MetadataProvider has an
  internal cache (i.e., if it is a [[CachedMetadataProvider]]), it should return any cached objects and only fetch
  ones not present in the cache. This should not error if any objects were not found. The order objects are returned
  in does not matter. For MetadataProviders that have a cache, calling this method can be done for side-effects (to
  warm the cache)."
  [metadata-provider :- ::metadata-provider
   metadata-type     :- ::metadata-type-excluding-database
   names             :- [:maybe
                         [:or
                          [:sequential :string]
                          [:set :string]]]]
  (when (seq names)
    (metadatas metadata-provider {:lib/type metadata-type, :name (set names)})))

(mu/defn- metadata-by-name :- [:maybe ::metadata]
  [metadata-provider :- ::metadata-provider
   metadata-type     :- ::metadata-type-excluding-database
   metadata-name     :- :string]
  (first (metadatas-by-name metadata-provider metadata-type #{metadata-name})))

(mu/defn tables :- [:maybe [:sequential ::lib.schema.metadata/table]]
  "Return a sequence of Tables in this Database. Tables should satisfy the `:metabase.lib.schema.metadata/table`
  schema."
  [metadata-provider :- ::metadata-provider]
  (metadatas metadata-provider {:lib/type :metadata/table}))

(mu/defn metadatas-for-table :- [:maybe [:sequential ::metadata]]
  "Return active (non-archived) metadatas associated with a particular Table, either Fields, Measures, Metrics, or
  Segments -- `metadata-type` must be one of `:metadata/column`, `:metadata/measure`, `:metadata/metric`, or `:metadata/segment`."
  [metadata-provider :- ::metadata-provider
   metadata-type     :- [:enum :metadata/column :metadata/measure :metadata/metric :metadata/segment]
   table-id          :- ::lib.schema.id/table]
  (metadatas metadata-provider {:lib/type metadata-type, :table-id table-id}))

(mu/defn metadatas-for-card :- [:maybe [:sequential ::metadata]]
  "Return active (non-archived) metadatas associated with a particular Card, currently only Metrics, so
  `metadata-type` must be `:metadata/metric`."
  [metadata-provider :- ::metadata-provider
   metadata-type     :- [:enum :metadata/column :metadata/metric :metadata/segment]
   card-id           :- ::lib.schema.id/card]
  (metadatas metadata-provider {:lib/type metadata-type, :card-id card-id}))

(mu/defn table :- [:maybe ::lib.schema.metadata/table]
  "Return metadata for a specific Table. Metadata should satisfy `:metabase.lib.schema.metadata/table`."
  [metadata-provider :- ::metadata-provider
   table-id          :- ::lib.schema.id/table]
  (metadata-by-id metadata-provider :metadata/table table-id))

(mu/defn field :- [:maybe ::lib.schema.metadata/column]
  "Return metadata for a specific Field. Metadata should satisfy `:metabase.lib.schema.metadata/column`."
  [metadata-provider :- ::metadata-provider
   field-id          :- ::lib.schema.id/field]
  (metadata-by-id metadata-provider :metadata/column field-id))

(mu/defn card :- [:maybe ::lib.schema.metadata/card]
  "Return information about a specific Saved Question, aka a Card. This should match
  `:metabase.lib.schema.metadata/card`. Currently just used for display name purposes if you have a Card as a source
  query."
  [metadata-provider :- ::metadata-provider
   card-id           :- ::lib.schema.id/card]
  (metadata-by-id metadata-provider :metadata/card card-id))

;; TODO: Better schemas for transforms.
(mu/defn transform :- [:maybe [:map]]
  "Return information about a specific Transform. Nil if it does not exist."
  [metadata-provider :- ::metadata-provider
   card-id           :- ::lib.schema.id/card]
  (metadata-by-id metadata-provider :metadata/transform card-id))

(mu/defn transforms :- [:maybe [:sequential [:map]]]
  "Return information about all Transforms."
  [metadata-provider :- ::metadata-provider]
  (metadatas metadata-provider {:lib/type :metadata/transform}))

(mu/defn native-query-snippet :- [:maybe ::lib.schema.metadata/native-query-snippet]
  "Get metadata for a NativeQuerySnippet with `snippet-id` if it can be found."
  [metadata-provider :- ::metadata-provider
   snippet-id        :- ::lib.schema.id/native-query-snippet]
  (metadata-by-id metadata-provider :metadata/native-query-snippet snippet-id))

(mu/defn native-query-snippet-by-name :- [:maybe ::lib.schema.metadata/native-query-snippet]
  "Get metadata for a NativeQuerySnippet with `snippet-name` if it can be found."
  [metadata-provider :- ::metadata-provider
   snippet-name      :- :string]
  (metadata-by-name metadata-provider :metadata/native-query-snippet snippet-name))

(mu/defn segment :- [:maybe ::lib.schema.metadata/segment]
  "Return metadata for a particular captial-S Segment, i.e. something from the `segment` table in the application
  database. Metadata should match `:metabase.lib.schema.metadata/segment`."
  [metadata-provider :- ::metadata-provider
   segment-id        :- ::lib.schema.id/segment]
  (metadata-by-id metadata-provider :metadata/segment segment-id))

(mu/defn measure :- [:maybe ::lib.schema.metadata/measure]
  "Return metadata for a particular Measure, i.e. something from the `measure` table in the application
  database. Metadata should match `:metabase.lib.schema.metadata/measure`."
  [metadata-provider :- ::metadata-provider
   measure-id        :- ::lib.schema.id/measure]
  (metadata-by-id metadata-provider :metadata/measure measure-id))

(mu/defn fields :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Return a sequence of Fields associated with a Table with the given `table-id`. Fields should satisfy
  the `:metabase.lib.schema.metadata/column` schema. If no such Table exists, this should error.

  `opts` is an optional map that can contain:
  - `:include-sensitive?` - if `true`, include Fields with `:visibility-type` `:sensitive` in the results."
  ([metadata-provider :- ::metadata-provider
    table-id          :- ::lib.schema.id/table]
   (fields metadata-provider table-id nil))
  ([metadata-provider :- ::metadata-provider
    table-id          :- ::lib.schema.id/table
    opts              :- [:maybe [:map [:include-sensitive? {:optional true} :boolean]]]]
   (metadatas metadata-provider {:lib/type           :metadata/column
                                 :table-id           table-id
                                 :include-sensitive? (boolean (:include-sensitive? opts))})))

(mu/defn segments :- [:maybe [:sequential ::lib.schema.metadata/segment]]
  "Return a sequence of legacy Segments associated with a Table with the given `table-id`. Segments should satisfy
  the `:metabase.lib.schema.metadata/segment` schema. If no Table with ID `table-id` exists, this should error."
  [metadata-provider :- ::metadata-provider
   table-id          :- ::lib.schema.id/table]
  (metadatas metadata-provider {:lib/type :metadata/segment, :table-id table-id}))

(mu/defn measures :- [:maybe [:sequential ::lib.schema.metadata/measure]]
  "Return a sequence of Measures associated with a Table with the given `table-id`. Measures should satisfy
  the `:metabase.lib.schema.metadata/measure` schema. If no Table with ID `table-id` exists, this should error."
  [metadata-provider :- ::metadata-provider
   table-id          :- ::lib.schema.id/table]
  (metadatas metadata-provider {:lib/type :metadata/measure, :table-id table-id}))

(#?(:clj p/defprotocol+ :cljs defprotocol) CachedMetadataProvider
  "Optional. A protocol for a MetadataProvider that some sort of internal cache. This is mostly useful for
  MetadataProviders that can hit some sort of relatively expensive external service,
  e.g. [[metabase.lib-be.metadata.jvm/application-database-metadata-provider]]. The main purpose of this is to allow
  pre-warming the cache with stuff that was already fetched elsewhere.
  See [[metabase.models.metric/warmed-metadata-provider]] for example.

  See [[metabase.lib.metadata.cached-provider/cached-metadata-provider]] for a way to wrap an existing
  MetadataProvider to add caching on top of it."
  ;;; TODO (Cam 9/10/25) -- we should update this to be the same shape as [[metadatas]]
  (cached-metadatas [cached-metadata-provider metadata-type metadata-ids]
    "Like [[metadatas]], but only return metadata that is already present in the cache.")
  (store-metadata! [cached-metadata-provider object]
    "Store metadata of a specific type, e.g. `:metadata/table`.")
  (cached-value [cached-metadata-provider k not-found]
    "Fetch a general cached value stored by [[cache-value!]] with the key `k`.")
  (cache-value! [cached-metadata-provider k v]
    "Store a general cached value `v` under the key `k`.")
  (has-cache? [cached-metadata-provider]
    "Whether this metadata provider actually has a cache or not. (Some metadata providers like
  ComposedMetadataProvider implement this method but can only cache stuff if one of the providers they wrap is a cached
  metadata provider.)")
  (clear-cache! [cached-metadata-provider]
    "Removes everything from the cache of this `CachedMetadataProvider`. Should not need to be called in general,
    but some tests want to eg. reuse card numbers and caching can return stale cards."))

(defn cached-metadata-provider?
  "Whether `x` satisfies the [[CachedMetadataProvider]] protocol. This does not necessarily mean it actually caches
  anything! Check [[cached-metadata-provider-with-cache?]] if that's what you want to know."
  [x]
  #?(:clj (extends? CachedMetadataProvider (class x))
     :cljs (satisfies? CachedMetadataProvider x)))

(mr/def ::cached-metadata-provider
  [:fn
   {:error/message "A CachedMetadataProvider"}
   #'cached-metadata-provider?])

(defn cached-metadata-provider-with-cache?
  "Whether `x` is a [[CachedMetadataProvider]] that [[has-cache?]]."
  [x]
  (and (cached-metadata-provider? x)
       (has-cache? x)))

(mr/def ::cached-metadata-provider-with-cache
  [:fn
   {:error/message "A CachedMetadataProvider with a cache"}
   #'cached-metadata-provider-with-cache?])

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
;;;
;;; TODO (Cam 9/22/25) -- if we have this, do we still need [[store-metadata!]] and [[store-metadatas!]]?
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
    (metadatas metadata-provider {:lib/type metadata-type, :id (set object-ids)})))

(#?(:clj p/defprotocol+ :cljs defprotocol) InvocationTracker
  "Optional. A protocol for a MetadataProvider that records the arguments of method invocations during query execution.
  This is useful for tracking which metadata ids were used during a query execution. The main purpose of this is to power
  updating card.last_used_at during query execution. see [[metabase.query-processor.middleware.update-used-cards/update-used-cards!]]"
  (invoked-ids [this metadata-type]
    "Get all invoked ids of a metadata type thus far."))
