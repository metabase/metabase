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
   [metabase-enterprise.checker.store :as store]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.serialization.resolve :as resolve]
   [potemkin.types :as p.types]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Settable database protocol
;;; ===========================================================================

(p.types/defprotocol+ ISettableDatabase
  "Protocol for providers that can switch which database they report."
  (set-database! [this db-name]
    "Set the database name (string) this provider should return from `(database)`.")
  (clear-database! [this]
    "Clear the current database. `(database)` will return nil until `set-database!` is called again."))

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
        (let [load-fn (case kind
                        :database   store/load-database!
                        :table      store/load-table!
                        :field      store/load-field!
                        :card       store/load-card!
                        :snippet    store/load-snippet!
                        :transform  store/load-transform!
                        :segment    store/load-segment!
                        :dashboard  store/load-dashboard!
                        :collection store/load-collection!
                        :document   store/load-document!
                        :measure    store/load-measure!)
              found? (some? (load-fn store ref))]
          (if found?
            (store/get-or-assign! store kind ref)
            (do (when !failures (swap! !failures conj failure-info))
                (when sentinel?
                  (store/get-or-assign! store kind ref))))))))

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
  [resolver data]
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
    (and resolver (vector? (:fk_target_field_id data)))
    (as-> m (if-let [fk-id (resolve/import-field-fk resolver (:fk_target_field_id data))]
              (assoc m :fk-target-field-id fk-id)
              m))))

(defn- convert-result-metadata-column
  "Resolve portable refs in a result_metadata column map.
   Portable refs appear as path vectors in :id, :table_id, :fk_target_field_id,
   and as MBQL field refs in :field_ref."
  [resolver col]
  (let [resolve-or-drop (fn [col k resolve-fn]
                          (let [v (get col k)]
                            (if-not (vector? v)
                              col
                              (if-let [id (resolve-fn resolver v)]
                                (assoc col k id)
                                (dissoc col k)))))]
    (-> col
        (resolve-or-drop :id resolve/import-field-fk)
        (resolve-or-drop :table_id resolve/import-table-fk)
        (resolve-or-drop :fk_target_field_id resolve/import-field-fk)
        (cond-> (:field_ref col)
          (update :field_ref (fn [ref]
                               (let [resolved (resolve/import-mbql resolver ref)]
                                 (if (and (vector? resolved) (= :field (first resolved)) (nil? (second resolved)))
                                   ::drop
                                   resolved)))))
        (as-> c (if (= ::drop (:field_ref c)) (dissoc c :field_ref) c)))))

(defn- convert-dataset-query
  "Convert a dataset query from serdes format, resolving paths to IDs.

   Pipeline:
   1. lib/normalize — convert YAML strings to keywords (operators, types, etc.)
   2. resolve/import-mbql — resolve portable refs (path vectors) to integer IDs
      Uses a sentinel resolver so unresolved refs get IDs for better error reporting."
  [resolver query]
  (when query
    (try
      (let [query    (lib/normalize nil query)
            db-name  (:database query)
            db-id    (when (string? db-name)
                       (resolve/import-fk-keyed resolver db-name :model/Database :name))
            query    (cond-> query db-id (assoc :database db-id))
            query    (resolve/import-mbql resolver query)]
        query)
      (catch Exception _
        (let [db-name (:database query)
              db-id   (when (string? db-name)
                        (resolve/import-fk-keyed resolver db-name :model/Database :name))]
          (cond-> query db-id (assoc :database db-id)))))))

;;; ---------------------------------------------------------------------------
;;; High-level entity conversion (public — used by semantic.clj)
;;; ---------------------------------------------------------------------------

(declare compute-result-metadata)

(defn card-metadata
  "Convert a cached card entity to lib metadata. Returns the metadata map with
   `:provider/resolution-failures` and `:provider/missing-database` keys when resolution fails."
  [store data]
  (let [!failures       (atom [])
        ;; Sentinel resolver: unresolved refs get fake integer IDs so queries can still be constructed and
        ;; lib/find-bad-refs reports issues with context. We use the same resolver for both the query and metadata
        ;; (table_id, FK targets, result_metadata). If we ever need to distinguish "soft failure" (metadata)
        ;; from "must-build" (query), create a second resolver with :sentinel? false and use it for the metadata
        ;; resolution calls below.
        resolver        (make-import-resolver store !failures :sentinel? true)
        table-id        (when-let [t (:table_id data)]
                          (if (vector? t)
                            (resolve/import-table-fk resolver t)
                            t))
        db-name         (get-in data [:dataset_query :database])
        db-id           (when (string? db-name)
                          (resolve/import-fk-keyed resolver db-name :model/Database :name))
        dataset-query   (convert-dataset-query resolver (:dataset_query data))
        result-metadata (if-let [cols (seq (:result_metadata data))]
                          (->> cols
                               (map (partial convert-result-metadata-column resolver))
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
        resolver  (make-import-resolver store !failures :sentinel? true)
        query     (convert-dataset-query resolver (get-in data [:source :query]))]
    (cond-> {:lib/type :metadata/transform
             :id       (:id data)
             :name     (:name data)
             :source   (assoc (:source data) :query query)}
      (seq @!failures) (assoc :provider/resolution-failures (vec (distinct @!failures))))))

(defn- ->segment-metadata
  [store data]
  (let [!failures  (atom [])
        resolver   (make-import-resolver store !failures :sentinel? true)
        definition (convert-dataset-query resolver (:definition data))]
    (cond-> {:lib/type   :metadata/segment
             :id         (:id data)
             :name       (:name data)
             :definition definition}
      (seq @!failures) (assoc :provider/resolution-failures (vec (distinct @!failures))))))

;;; ===========================================================================
;;; MetadataProvider
;;; ===========================================================================

(deftype SourceMetadataProvider
  ;; The store knows what entities exist, loads raw YAML data, assigns integer IDs, and caches.
  ;; The provider adapts the store into the MetadataProvider interface that lib/query expects,
  ;; converting raw YAML maps to lib metadata format along the way.
  ;;
  ;; `current-db` is an atom holding the database name (string) to return from `(database)`.
  ;; Must be set via `set-database!` before each entity check and unset afterward.
         [store current-db]
  ISettableDatabase
  (set-database! [_this db-name]
    (reset! current-db db-name))
  (clear-database! [_this]
    (reset! current-db nil))

  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (let [db-name @current-db]
      (when (nil? db-name)
        (throw (ex-info "No current database set on provider. Call set-database! before querying." {})))
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
         ;; Only return tables for the current database — uses lightweight
         ;; path-derived metadata, no YAML parsing
         (let [db-name @current-db]
           (for [path (store/tables-for-database store db-name)
                 :let [data (store/ensure-table-id! store path)]
                 :when data]
             (->table-metadata data)))))

      :metadata/column
      (vec
       (cond
         id
         (for [fid id
               :let [path (store/id->ref store :field fid)]
               :when path
               :let [data (store/load-field! store path)]
               :when data]
           (->field-metadata (make-import-resolver store nil) data))

         table-id
         (let [table-path (store/id->ref store :table table-id)]
           (when table-path
             (for [fpath (store/fields-for-table store table-path)
                   :let [data (store/load-field! store fpath)]
                   :when data]
               (->field-metadata (make-import-resolver store nil) data))))

         :else
         (for [path (store/all-field-paths store)
               :let [data (store/load-field! store path)]
               :when data]
           (->field-metadata (make-import-resolver store nil) data))))

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

(declare make-provider)

(defn- compute-result-metadata
  [store dataset-query]
  (try
    (let [provider (make-provider store)
          db-id    (:database dataset-query)
          db-name  (when (integer? db-id) (store/id->ref store :database db-id))]
      (when db-name
        (set-database! provider db-name))
      (let [query (lib/query provider dataset-query)]
        (mapv #(select-keys % [:name :base-type :effective-type :semantic-type :display-name])
              (lib/returned-columns query))))
    (catch Exception _ nil)))

;;; ===========================================================================
;;; Public API
;;; ===========================================================================

(defn make-provider
  "Create a MetadataProvider backed by a store.
   The store holds sources, index, ID registry, and entity caches —
   see `checker.store/make-store`."
  [store]
  (->SourceMetadataProvider store (atom nil)))

(defn database-name-for-entity
  "Determine the database name for an entity from its raw YAML data.
   Cards have it in dataset_query.database, transforms in source.query.database."
  [store kind data]
  (let [db-ref (case kind
                 :card      (get-in data [:dataset_query :database])
                 :transform (or (get-in data [:source :query :database])
                                (:source_database_id data))
                 nil)]
    (cond
      (string? db-ref)  db-ref
      (integer? db-ref) (store/id->ref store :database db-ref)
      :else             nil)))
