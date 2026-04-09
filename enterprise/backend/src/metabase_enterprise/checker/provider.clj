(ns metabase-enterprise.checker.provider
  "Adapts a checker store into a lib MetadataProvider.

   The store (checker.store) knows what entities exist and can load them.
   This namespace converts that raw data into the lib metadata format that
   `lib/query` and `deps.analysis/check-entity` expect.

   Responsibilities:
   - Convert raw YAML entity maps → lib metadata maps (keywordize types,
     resolve FK targets, normalize MBQL operators, resolve portable refs)
   - Implement `MetadataProvider` by delegating to the store
   - Assign sentinel IDs for unresolved refs so queries can still be
     constructed and `lib/find-bad-refs` reports issues with context

   Public API:
   - `(make-provider store)` — wrap a store in a MetadataProvider
   - `(card-metadata store data)` — convert a card, collecting resolution failures
   - `(transform-metadata store data)` — convert a transform, collecting resolution failures"
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.checker.source :as source]
   [metabase-enterprise.checker.store :as store]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.serialization.resolve :as resolve]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Reference resolution
;;;
;;; Resolution functions take the store and a `!failures` atom (or nil).
;;; When a ref can't be resolved, a failure map is conj'd onto the atom.
;;; ===========================================================================

(defn- resolve-ref
  "Try to resolve `ref` of `kind`. Returns integer ID or nil.
   On failure, appends failure-info to `!failures`.
   When `sentinel?` is true, assigns a sentinel ID for unresolved refs."
  [store kind ref !failures failure-info & {:keys [sentinel?]}]
  (when ref
    (or (store/ref->id store kind ref)
        (case kind
          (:field :table :database)
          (let [resolve-fn (case kind
                             :field    source/resolve-field
                             :table    source/resolve-table
                             :database source/resolve-database)]
            (when (resolve-fn (store/schema-source store) ref)
              (store/get-or-assign! store kind ref)))
          :card
          (when (source/resolve-card (store/assets-source store) ref)
            (store/get-or-assign! store kind ref))
          ;; measures, segments, snippets — check the index
          (when (store/in-index? store kind ref)
            (store/get-or-assign! store kind ref)))
        (do (when !failures (swap! !failures conj failure-info))
            (when sentinel?
              (store/get-or-assign! store kind ref))))))

(defn- resolve-field-path
  ([store !failures field-path]
   (resolve-ref store :field field-path !failures {:type :field :path field-path}))
  ([store !failures field-path sentinel?]
   (resolve-ref store :field field-path !failures {:type :field :path field-path} :sentinel? sentinel?)))

(defn- resolve-table-path
  ([store !failures table-path]
   (resolve-ref store :table table-path !failures {:type :table :path table-path}))
  ([store !failures table-path sentinel?]
   (resolve-ref store :table table-path !failures {:type :table :path table-path} :sentinel? sentinel?)))

(defn- resolve-db-name [store !failures db-name]
  (resolve-ref store :database db-name !failures {:type :database :name db-name}))

(defn- resolve-card-entity-id [store !failures entity-id]
  (resolve-ref store :card entity-id !failures {:type :card :entity-id entity-id}))

;;; ---------------------------------------------------------------------------
;;; SerdesImportResolver — bridges store-based resolution into import-mbql
;;; ---------------------------------------------------------------------------

(defn- make-import-resolver
  [store !failures & {:keys [sentinel?]}]
  (reify resolve/SerdesImportResolver
    (import-fk [_ eid model]
      #_{:clj-kondo/ignore [:case-symbol-test]}
      (case model
        Card               (resolve-card-entity-id store !failures eid)
        Segment            (resolve-ref store :segment eid !failures {:type :segment :entity-id eid})
        Measure            (resolve-ref store :measure eid !failures {:type :measure :entity-id eid})
        NativeQuerySnippet (resolve-ref store :snippet eid !failures {:type :snippet :entity-id eid})
        (do (when !failures
              (swap! !failures conj {:type :unknown :model model :entity-id eid}))
            nil)))
    (import-fk-keyed [_ portable model field]
      (case [model field]
        [:model/Database :name] (resolve-db-name store !failures portable)
        (do (when !failures
              (swap! !failures conj {:type :keyed-lookup :model model :field field :value portable}))
            nil)))
    (import-user [_ _email] nil)
    (import-table-fk [_ path] (resolve-table-path store !failures path sentinel?))
    (import-field-fk [_ path] (resolve-field-path store !failures path sentinel?))))

;;; ===========================================================================
;;; Data conversion — raw YAML entity maps → lib metadata maps
;;; ===========================================================================

(defn- ->database-metadata [data]
  {:lib/type     :metadata/database
   :id           (:id data)
   :name         (:name data)
   :engine       (keyword (:engine data))
   :dbms-version (:dbms_version data)
   :features     #{:foreign-keys :nested-queries :expressions :native-parameters
                   :basic-aggregations :standard-deviation-aggregations
                   :expression-aggregations :left-join :right-join :inner-join :full-join}
   :settings     (:settings data)})

(defn- ->table-metadata [data]
  {:lib/type        :metadata/table
   :id              (:id data)
   :name            (:name data)
   :display-name    (:display_name data)
   :schema          (:schema data)
   :db-id           (:db_id data)
   :active          (if (contains? data :active) (:active data) true)
   :visibility-type (some-> (:visibility_type data) keyword)})

(defn- ->field-metadata
  [store !failures data]
  (cond-> {:lib/type        :metadata/column
           :id              (:id data)
           :table-id        (:table_id data)
           :name            (:name data)
           :display-name    (:display_name data)
           :base-type       (keyword (:base_type data))
           :effective-type  (or (some-> (:effective_type data) keyword)
                                (keyword (:base_type data)))
           :semantic-type   (some-> (:semantic_type data) keyword)
           :database-type   (:database_type data)
           :active          (if (contains? data :active) (:active data) true)
           :visibility-type (some-> (:visibility_type data) keyword)
           :position        (:position data)}
    (vector? (:fk_target_field_id data))
    (as-> m (if-let [fk-id (resolve-field-path store !failures (:fk_target_field_id data))]
              (assoc m :fk-target-field-id fk-id)
              m))))

(defn- field-ref-has-nil? [ref]
  (and (vector? ref) (= :field (first ref)) (nil? (second ref))))

(defn- convert-result-metadata-column [resolver store !failures col]
  (binding [resolve/*import-resolver* resolver]
    (cond-> col
      (vector? (:id col))
      (as-> c (if-let [id (resolve-field-path store !failures (:id col))]
                (assoc c :id id) (dissoc c :id)))
      (vector? (:table_id col))
      (as-> c (if-let [id (resolve-table-path store !failures (:table_id col))]
                (assoc c :table_id id) (dissoc c :table_id)))
      (vector? (:fk_target_field_id col))
      (as-> c (if-let [id (resolve-field-path store !failures (:fk_target_field_id col))]
                (assoc c :fk_target_field_id id) (dissoc c :fk_target_field_id)))
      (:field_ref col)
      (as-> c (let [ref (resolve/import-mbql (:field_ref col))]
                (if (field-ref-has-nil? ref) (dissoc c :field_ref) (assoc c :field_ref ref)))))))

;;; ---------------------------------------------------------------------------
;;; MBQL normalization — YAML strings → keywords
;;; ---------------------------------------------------------------------------

(defn- mbql-operator?
  [^String s]
  (and (not (str/blank? s))
       (not (str/includes? s " "))
       (let [c (.charAt s 0)]
         (not (Character/isUpperCase c)))))

(def ^:private temporal-unit-strings
  #{"day" "day-of-month" "day-of-week" "day-of-year" "default"
    "hour" "hour-of-day" "millisecond" "minute" "minute-of-hour"
    "month" "month-of-year" "quarter" "quarter-of-year"
    "second" "second-of-minute" "week" "week-of-year" "year" "year-of-era"
    "iso" "us" "instance"
    "current"})

(defn- maybe-keywordize-arg [form]
  (if (and (string? form) (contains? temporal-unit-strings form))
    (keyword form)
    form))

(defn- keywordize-mbql-operators
  [form]
  (cond
    (and (vector? form) (seq form) (string? (first form)) (mbql-operator? (first form)))
    (into [(keyword (first form))] (map #(-> % keywordize-mbql-operators maybe-keywordize-arg)) (rest form))

    (vector? form)
    (mapv keywordize-mbql-operators form)

    (map? form)
    (reduce-kv (fn [m k v] (assoc m k (keywordize-mbql-operators v))) {} form)

    (sequential? form)
    (map keywordize-mbql-operators form)

    :else form))

(defn- convert-dataset-query
  "Convert a dataset query from serdes format, resolving paths to IDs."
  [store !failures query]
  (when query
    (try
      (let [query   (update query :stages
                            (fn [stages]
                              (mapv (fn [stage]
                                      (-> stage
                                          (m/update-existing :native keywordize-mbql-operators)
                                          (cond-> (not (:native stage))
                                            (keywordize-mbql-operators))))
                                    (or stages []))))
            db-name (:database query)
            db-id   (when (string? db-name) (resolve-db-name store !failures db-name))
            query   (cond-> query db-id (assoc :database db-id))
            resolver (make-import-resolver store !failures :sentinel? true)
            query   (binding [resolve/*import-resolver* resolver]
                      (resolve/import-mbql query))]
        query)
      (catch Exception _
        (let [db-name (:database query)
              db-id   (when (string? db-name) (resolve-db-name store !failures db-name))]
          (cond-> query db-id (assoc :database db-id)))))))

;;; ---------------------------------------------------------------------------
;;; High-level entity conversion (public — used by semantic.clj)
;;; ---------------------------------------------------------------------------

(declare compute-result-metadata)

(defn card-metadata
  "Convert a cached card entity to lib metadata. Returns the metadata map with
   `:provider/resolution-failures` and `:provider/missing-database` keys when resolution fails."
  [store data]
  (let [!failures (atom [])
        resolver   (make-import-resolver store !failures)
        table-id   (when-let [t (:table_id data)]
                     (if (vector? t)
                       (resolve-table-path store !failures t)
                       t))
        db-name    (get-in data [:dataset_query :database])
        db-id      (when (string? db-name) (resolve-db-name store !failures db-name))
        dataset-query   (convert-dataset-query store !failures (:dataset_query data))
        result-metadata (if-let [cols (seq (:result_metadata data))]
                          (->> cols
                               (map (partial convert-result-metadata-column resolver store !failures))
                               (lib/normalize [:sequential ::lib.schema.metadata/lib-or-legacy-column]))
                          (when (and dataset-query db-id)
                            (compute-result-metadata store dataset-query)))]
    (cond-> {:lib/type        :metadata/card
             :id              (:id data)
             :name            (:name data)
             :type            (some-> (:type data) keyword)
             :dataset-query   dataset-query
             :result-metadata result-metadata
             :archived        (:archived data)}
      db-id              (assoc :database-id db-id)
      (not db-id)        (assoc :provider/missing-database db-name)
      table-id           (assoc :table-id table-id)
      (seq @!failures)   (assoc :provider/resolution-failures (vec (distinct @!failures))))))

(defn transform-metadata
  "Convert a cached transform entity to lib metadata with its source query resolved."
  [store data]
  (let [!failures (atom [])
        query     (convert-dataset-query store !failures (get-in data [:source :query]))]
    (cond-> {:lib/type :metadata/transform
             :id       (:id data)
             :name     (:name data)
             :source   (assoc (:source data) :query query)}
      (seq @!failures) (assoc :provider/resolution-failures (vec (distinct @!failures))))))

(defn- ->segment-metadata
  [store data]
  (let [!failures   (atom [])
        definition  (convert-dataset-query store !failures (:definition data))]
    (cond-> {:lib/type   :metadata/segment
             :id         (:id data)
             :name       (:name data)
             :definition definition}
      (seq @!failures) (assoc :provider/resolution-failures (vec (distinct @!failures))))))

;;; ===========================================================================
;;; MetadataProvider
;;; ===========================================================================

(deftype SourceMetadataProvider [store]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-let [db-name (first (store/all-database-names store))]
      (when-let [data (store/load-database! store db-name)]
        (->database-metadata data))))

  (metadatas [_this {:keys [lib/type id table-id name]}]
    (case type
      :metadata/table
      (vec
       (if id
         (for [tid id
               :let [path (store/id->ref store :table tid)]
               :when path
               :let [data (store/load-table! store path)]
               :when data]
           (->table-metadata data))
         (for [path (store/all-table-paths store)
               :let [data (store/load-table! store path)]
               :when data]
           (->table-metadata data))))

      :metadata/column
      (vec
       (cond
         id
         (for [fid id
               :let [path (store/id->ref store :field fid)]
               :when path
               :let [data (store/load-field! store path)]
               :when data]
           (->field-metadata store nil data))

         table-id
         (let [table-path (store/id->ref store :table table-id)]
           (when table-path
             (for [fpath (store/fields-for-table store table-path)
                   :let [data (store/load-field! store fpath)]
                   :when data]
               (->field-metadata store nil data))))

         :else
         (for [path (store/all-field-paths store)
               :let [data (store/load-field! store path)]
               :when data]
           (->field-metadata store nil data))))

      :metadata/card
      (vec
       (if id
         (for [cid id
               :let [eid (store/id->ref store :card cid)]
               :when eid
               :let [data (store/load-card! store eid)]
               :when data]
           (card-metadata store data))
         (for [eid (store/all-card-ids store)
               :let [data (store/load-card! store eid)]
               :when data]
           (card-metadata store data))))

      :metadata/native-query-snippet
      (vec
       (cond
         id
         (for [sid id
               :let [eid (store/id->ref store :snippet sid)]
               :when eid
               :let [data (store/load-snippet! store eid)]
               :when data]
           {:lib/type :metadata/native-query-snippet
            :id       (:id data)
            :name     (:name data)
            :content  (:content data)})

         name
         (for [eid (store/all-refs store :snippet)
               :let [data (store/load-snippet! store eid)]
               :when data
               :when (contains? name (:name data))]
           {:lib/type :metadata/native-query-snippet
            :id       (:id data)
            :name     (:name data)
            :content  (:content data)})

         :else []))

      :metadata/transform
      (vec
       (if id
         (for [tid id
               :let [eid (store/id->ref store :transform tid)]
               :when eid
               :let [data (store/load-transform! store eid)]
               :when data]
           (transform-metadata store data))
         (for [eid (store/all-refs store :transform)
               :let [data (store/load-transform! store eid)]
               :when data]
           (transform-metadata store data))))

      :metadata/segment
      (vec
       (if id
         (for [sid id
               :let [eid (store/id->ref store :segment sid)]
               :when eid
               :let [data (store/load-segment! store eid)]
               :when data]
           (->segment-metadata store data))
         (for [eid (store/all-refs store :segment)
               :let [data (store/load-segment! store eid)]
               :when data]
           (->segment-metadata store data))))

      nil))

  (setting [_this _key] nil)

  lib.metadata.protocols/CachedMetadataProvider
  (cached-metadatas [this type ids]
    (lib.metadata.protocols/metadatas this {:lib/type type :id (set ids)}))
  (store-metadata! [_this _obj] nil)
  (cached-value [_this _k not-found] not-found)
  (cache-value! [_this _k _v] nil)
  (has-cache? [_this] true)
  (clear-cache! [_this] nil))

(defn- compute-result-metadata
  [store dataset-query]
  (try
    (let [provider (->SourceMetadataProvider store)
          query    (lib/query provider dataset-query)]
      (mapv #(select-keys % [:name :base-type :effective-type :semantic-type :display-name])
            (lib/returned-columns query)))
    (catch Exception _ nil)))

;;; ===========================================================================
;;; Public API
;;; ===========================================================================

(defn make-provider
  "Create a MetadataProvider backed by a store.
   The store holds sources, index, ID registry, and entity caches —
   see `checker.store/make-store`."
  [store]
  (->SourceMetadataProvider store))
