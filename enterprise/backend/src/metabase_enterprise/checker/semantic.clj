(ns metabase-enterprise.checker.semantic
  "Semantic checker — validates that entity references resolve and queries are correct.

   Uses MLv2 (metabase.lib) without a database connection.
   Works with any MetadataSource implementation.

   Architecture:
   1. A *store* (checker.store) holds a MetadataSource, a file index for
      enumeration, a bidirectional ID registry (portable refs ↔ synthetic
      integer IDs), and entity caches.
   2. Entities are loaded lazily from the source and cached with assigned IDs.
   3. A MetadataProvider backed by the store serves lib/query.
   4. lib/query and lib/find-bad-refs validate queries.
   5. checker.native validates native SQL using sql-parsing and sql-tools.
   6. Unresolved refs get sentinel IDs so queries can still be constructed
      and lib/find-bad-refs can report the issue with context."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.format.serdes :as serdes]
   [metabase-enterprise.checker.native :as native]
   [metabase-enterprise.checker.source :as source]
   [metabase-enterprise.checker.store :as store]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Reference resolution — resolve portable refs to IDs, collecting failures
;;;
;;; Resolution functions take the store and a `!failures` atom (or nil).
;;; When a ref can't be resolved, a failure map is conj'd onto the atom
;;; for the caller to inspect. The failure maps look like:
;;;   {:type :field :path ["DB" "schema" "table" "field"]}
;;;   {:type :table :path ["DB" "schema" "table"]}
;;;   {:type :database :name "DB"}
;;; ===========================================================================

(defn- resolve-ref
  "Try to resolve `ref` of `kind`. Returns integer ID or nil.
   On failure, appends failure-info to `!failures` atom (if provided).

   When `sentinel?` is true, assigns a sentinel ID for unresolved refs instead
   of returning nil. This allows query construction to proceed so that
   lib/find-bad-refs can report the issue. The sentinel ID has no backing
   metadata in the provider, so lib will flag it."
  [store kind ref !failures failure-info & {:keys [sentinel?]}]
  (when ref
    (or (store/ref->id store kind ref)
        (let [resolve-fn (case kind
                           :field    source/resolve-field
                           :table    source/resolve-table
                           :database source/resolve-database
                           :card     source/resolve-card)]
          (when (resolve-fn (store/source store) ref)
            (store/get-or-assign! store kind ref)))
        (do (when !failures (swap! !failures conj failure-info))
            (when sentinel?
              ;; Assign an ID so the query can be constructed, but no metadata
              ;; will exist for this ID — lib/find-bad-refs will catch it.
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
  "Build a `SerdesImportResolver` that resolves against `store`,
   collecting failures in `!failures` (an atom, or nil to discard).

   When `sentinel?` is true, unresolved field/table refs get sentinel IDs
   instead of nil, allowing query construction to proceed."
  [store !failures & {:keys [sentinel?]}]
  (reify resolve/SerdesImportResolver
    (import-fk [_ eid model]
      (case model
        (Card Segment Measure) (resolve-card-entity-id store !failures eid)
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
;;; Data conversion — entity maps from source → lib metadata maps
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
  "Convert a cached field entity to lib metadata. Resolves FK targets if present."
  [store !failures data]
  (cond-> {:lib/type        :metadata/column
           :id              (:id data)
           :table-id        (:table_id data)
           :name            (:name data)
           :display-name    (:display_name data)
           :base-type       (keyword (:base_type data))
           :effective-type  (some-> (:effective_type data) keyword)
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

(defn- convert-dataset-query
  "Convert a dataset query from serdes format, resolving paths to IDs.
   Uses sentinel IDs for unresolved refs so the query can be constructed
   even when some fields/tables don't exist in the schema."
  [store !failures query]
  (when query
    (let [db-name (:database query)
          db-id   (when (string? db-name) (resolve-db-name store !failures db-name))
          query   (if db-id (assoc query :database db-id) query)
          resolver (make-import-resolver store !failures :sentinel? true)]
      (binding [resolve/*import-resolver* resolver]
        (resolve/import-mbql query)))))

(defn- ->card-metadata
  "Convert a cached card entity to lib metadata. Returns the metadata map with
   ::resolution-failures and ::missing-database keys when resolution fails."
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
        result-metadata (when-let [cols (seq (:result_metadata data))]
                          (->> cols
                               (map (partial convert-result-metadata-column resolver store !failures))
                               (lib/normalize [:sequential ::lib.schema.metadata/lib-or-legacy-column])))]
    (cond-> {:lib/type        :metadata/card
             :id              (:id data)
             :name            (:name data)
             :type            (some-> (:type data) keyword)
             :dataset-query   dataset-query
             :result-metadata result-metadata
             :archived        (:archived data)}
      db-id              (assoc :database-id db-id)
      (not db-id)        (assoc ::missing-database db-name)
      table-id           (assoc :table-id table-id)
      (seq @!failures)   (assoc ::resolution-failures (vec (distinct @!failures))))))

;;; ===========================================================================
;;; MetadataProvider — serves lib/query from the store
;;; ===========================================================================


(deftype SourceMetadataProvider [store]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-let [db-name (first (store/all-database-names store))]
      (when-let [data (store/load-database! store db-name)]
        (->database-metadata data))))

  (metadatas [_this {:keys [lib/type id table-id]}]
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
           (->card-metadata store data))
         (for [eid (store/all-card-ids store)
               :let [data (store/load-card! store eid)]
               :when data]
           (->card-metadata store data))))

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

(defn make-provider
  "Create a MetadataProvider backed by a store."
  [store]
  (->SourceMetadataProvider store))

;;; ===========================================================================
;;; Common entity checks — apply to any entity type
;;;
;;; These validations run on every entity (cards, dashboards, collections,
;;; metrics, segments, etc.). Add new cross-entity checks here.
;;; ===========================================================================

(defn- validate-collection-id
  "Validate that `collection_id` in `data` points to a known collection.
   Returns a failure map or nil."
  [store data]
  (when-let [coll-id (:collection_id data)]
    (let [kind (store/index-kind-of store coll-id)]
      (cond
        (nil? kind)
        {:type :collection :entity-id coll-id
         :message (str "collection_id " coll-id " not found")}

        (not= :collection kind)
        {:type :collection :entity-id coll-id
         :message (str "collection_id " coll-id " points to a " (name kind) ", not a collection")}))))

(defn- check-common
  "Run checks that apply to any entity (card, dashboard, metric, etc.).
   Returns a vector of failure maps, or empty vector if all checks pass."
  [store data]
  (filterv some?
           [(validate-collection-id store data)]))

;;; ===========================================================================
;;; Dashboard-specific checks
;;;
;;; Validates dashboard internal consistency:
;;; - dashcard card_id refs point to known cards
;;; - dashcard dashboard_tab_id refs point to tabs in this dashboard
;;; - dashcard grid positions are within bounds (24-column grid)
;;; ===========================================================================

(def ^:private grid-width
  "Dashboard grid width in columns."
  24)

(defn- validate-dashcard-card-ref
  "Validate that a dashcard's card_id points to a known card.
   Virtual cards (headings, text) have null card_id — that's fine."
  [store dashcard]
  (let [card-id (:card_id dashcard)]
    (when (and card-id (not (store/in-index? store :card card-id)))
      {:type :dashcard-card-ref
       :dashcard-entity-id (:entity_id dashcard)
       :entity-id card-id
       :message (str "dashcard " (:entity_id dashcard) " references card " card-id " which is not in the export")})))

(defn- validate-dashcard-tab-ref
  "Validate that a dashcard's dashboard_tab_id references a tab in this dashboard.
   dashboard_tab_id is [dashboard-entity-id, tab-entity-id]."
  [tab-entity-ids dashcard]
  (when-let [tab-ref (:dashboard_tab_id dashcard)]
    (let [tab-eid (if (vector? tab-ref) (second tab-ref) tab-ref)]
      (when (and tab-eid (not (contains? tab-entity-ids tab-eid)))
        {:type :dashcard-tab-ref
         :dashcard-entity-id (:entity_id dashcard)
         :entity-id tab-eid
         :message (str "dashcard " (:entity_id dashcard) " references tab " tab-eid " which is not in this dashboard")}))))

(defn- validate-dashcard-grid
  "Validate that a dashcard's grid position is within bounds."
  [dashcard]
  (let [col    (or (:col dashcard) 0)
        row    (or (:row dashcard) 0)
        size-x (or (:size_x dashcard) 1)
        size-y (or (:size_y dashcard) 1)
        eid    (:entity_id dashcard)]
    (cond
      (neg? col)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has negative col: " col)}

      (> (+ col size-x) grid-width)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " extends beyond grid: col=" col " + size_x=" size-x " > " grid-width)}

      (< size-x 1)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has invalid size_x: " size-x)}

      (< size-y 1)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has invalid size_y: " size-y)}

      (neg? row)
      {:type :dashcard-grid :dashcard-entity-id eid
       :message (str "dashcard " eid " has negative row: " row)})))

(defn- check-dashboard
  "Run dashboard-specific semantic checks on loaded dashboard data.
   Returns a vector of failure maps."
  [store data]
  (let [tabs          (:tabs data)
        dashcards     (:dashcards data)
        tab-entity-ids (into #{} (keep :entity_id) tabs)]
    (into []
          (keep identity)
          (mapcat (fn [dc]
                    [(validate-dashcard-card-ref store dc)
                     (validate-dashcard-tab-ref tab-entity-ids dc)
                     (validate-dashcard-grid dc)])
                  dashcards))))

;;; ===========================================================================
;;; Non-card entity checking — load from files, run common + type-specific checks
;;; ===========================================================================

(defn- check-entity-from-file
  "Load an entity YAML file from the index and run checks.
   Runs common checks on all entities, plus dashboard-specific checks.
   Returns [entity-id result-map] or nil if all checks pass."
  [store kind entity-id]
  (when-let [file (store/index-file store kind entity-id)]
    (try
      (let [data     (serdes/load-yaml file)
            failures (into (check-common store data)
                           (when (= :dashboard kind)
                             (check-dashboard store data)))]
        (when (seq failures)
          [entity-id {:name       (or (:name data) entity-id)
                      :entity-id  entity-id
                      :kind       kind
                      :unresolved failures}]))
      (catch Exception e
        [entity-id {:name       entity-id
                    :entity-id  entity-id
                    :kind       kind
                    :error      (.getMessage e)}]))))

(defn- check-non-card-entities
  "Run checks on indexed dashboards and collections (not cards).
   Cards are checked inline in check-card since their data is already loaded.
   Returns a map of entity-id → result for entities with failures."
  [store]
  (into {}
        (keep identity)
        (concat
         (map #(check-entity-from-file store :dashboard %) (store/all-refs store :dashboard))
         (map #(check-entity-from-file store :collection %) (store/all-refs store :collection)))))

;;; ===========================================================================
;;; Card validation
;;; ===========================================================================

(defn- id->path
  "Convert an integer ID back to a human-readable path string for error messages."
  [store id id-type]
  (case id-type
    :table    (some->> (store/id->ref store :table id) (str/join "."))
    :field    (some->> (store/id->ref store :field id) (str/join "."))
    :card     (when-let [eid (store/id->ref store :card id)]
                (or (:name (store/cached-entity store :card eid)) eid))
    :database (store/id->ref store :database id)
    nil))

(declare extract-refs-from-card)

(defn- extract-refs-from-query
  ([store query] (extract-refs-from-query store query nil #{}))
  ([store query provider visited]
   (let [table-ids  (lib/all-source-table-ids query)
         card-ids   (lib/all-source-card-ids query)
         cols       (try (lib/returned-columns query) (catch Exception _ nil))
         tables     (mapv #(id->path store % :table) table-ids)
         fields     (when cols (->> cols (keep :id) (mapv #(id->path store % :field))))
         cards      (mapv #(id->path store % :card) card-ids)
         transitive (when provider
                      (for [cid card-ids :when (not (visited cid))]
                        (extract-refs-from-card store provider cid (conj visited cid))))
         all-tables (into (vec (remove nil? tables)) (mapcat :tables transitive))
         all-fields (into (vec (remove nil? fields)) (mapcat :fields transitive))
         all-cards  (into (vec (remove nil? cards))  (mapcat :source-cards transitive))]
     {:tables       (vec (distinct all-tables))
      :fields       (vec (distinct all-fields))
      :source-cards (vec (distinct all-cards))})))

(defn- extract-refs-from-card [store provider card-id visited]
  (try
    (when-let [card (lib.metadata/card provider card-id)]
      (when-let [dq (:dataset-query card)]
        (extract-refs-from-query store (lib/query provider dq) provider visited)))
    (catch Exception _ {:tables [] :fields [] :source-cards []})))

;;; ===========================================================================
;;; Query checks — apply to entities with a dataset_query
;;; ===========================================================================

(defn- check-query
  "Validate an entity's dataset_query. Returns a result map with
   :refs, :unresolved, :bad-refs, :error, :native-errors."
  [store provider data]
  (let [card-meta (->card-metadata store data)
        card-id   (:id data)]
    (if-let [missing-db (::missing-database card-meta)]
      {:unresolved (into [{:type :database :name missing-db}]
                         (::resolution-failures card-meta))
       :error      (str "Unknown database: " missing-db)}
      (try
        (let [card      (lib.metadata/card provider card-id)
              query     (lib/query provider (:dataset-query card))
              refs      (extract-refs-from-query store query provider #{card-id})
              db-name   (get-in data [:dataset_query :database])
              is-native? (get-in data [:dataset_query :native :query])
              sql-refs  (when (and is-native? db-name)
                          (native/extract-sql-refs store db-name query))
              refs      (if sql-refs
                          (-> refs
                              (update :tables into (:tables sql-refs))
                              (update :fields into (:fields sql-refs))
                              (update :tables #(vec (distinct %)))
                              (update :fields #(vec (distinct %))))
                          refs)
              bad-refs      (lib/find-bad-refs query)
              native-errors (when is-native?
                              (native/validate-native-sql store provider query db-name))]
          (cond-> {:refs     refs
                   :unresolved (::resolution-failures card-meta)
                   :bad-refs bad-refs}
            (seq native-errors) (assoc :native-errors native-errors)))
        (catch Exception e
          {:unresolved (::resolution-failures card-meta)
           :error      (.getMessage e)})))))

;;; ===========================================================================
;;; Card checking — common checks + query checks
;;; ===========================================================================

(defn check-card
  "Check a single card: common checks (collection_id) + query validation."
  [store provider entity-id]
  (let [data            (store/load-card! store entity-id)
        common-failures (check-common store data)
        query-result    (check-query store provider data)
        all-unresolved  (into (or (:unresolved query-result) []) common-failures)]
    (cond-> {:card-id    (:id data)
             :name       (:name data)
             :entity-id  entity-id}
      (seq all-unresolved)          (assoc :unresolved all-unresolved)
      (:refs query-result)          (assoc :refs (:refs query-result))
      (:bad-refs query-result)      (assoc :bad-refs (:bad-refs query-result))
      (:native-errors query-result) (assoc :native-errors (:native-errors query-result))
      (:error query-result)         (assoc :error (:error query-result)))))

(defn- check-duplicate-entity-ids
  "Check for duplicate entity_ids in the index. Returns a map of
   synthetic key → result for each duplicate group."
  [index]
  (when-let [dupes (:duplicates index)]
    (into {}
          (for [{:keys [kind ref files]} dupes]
            [(str "duplicate:" ref)
             {:name       (str "Duplicate " (name kind) " entity_id: " ref)
              :entity-id  ref
              :kind       kind
              :error      (str "entity_id " ref " appears in " (count files) " files: "
                               (str/join ", " files))
              :suggested-replacement (u/generate-nano-id)}]))))

(defn check-cards
  "Check card queries and collection_id refs across all entity types.
   Returns map of entity-id → result.

   `index` is a file index: `{kind {ref file-path}}` (see store/make-store).
   Card query validation uses the source and provider.
   Dashboard/collection collection_id validation loads YAML from files in the index."
  [source index card-ids]
  (let [store    (store/make-store source index)
        provider (make-provider store)
        card-results (into {}
                           (for [eid card-ids]
                             [eid (check-card store provider eid)]))
        other-results (check-non-card-entities store)
        dupe-results  (check-duplicate-entity-ids index)]
    (merge card-results other-results dupe-results)))

;;; ===========================================================================
;;; Results processing — pure functions on result data
;;; ===========================================================================

(defn result-status
  "Compute the status of a single card result."
  [result]
  (cond
    (:error result)              :error
    (seq (:unresolved result))   :unresolved
    (seq (:native-errors result)) :native-errors
    (seq (:bad-refs result))     :issues
    :else                        :ok))

(defn summarize-results
  "Summarize check results into counts by status."
  [results]
  (let [by-status (group-by (comp result-status second) results)]
    {:total         (count results)
     :ok            (count (get by-status :ok))
     :errors        (count (get by-status :error))
     :unresolved    (count (get by-status :unresolved))
     :native-errors (count (get by-status :native-errors))
     :issues        (count (get by-status :issues))}))

(defn results-by-status
  "Group results by status. Returns map of status → seq of [entity-id result]."
  [results]
  (group-by (comp result-status second) results))

(defn format-result
  "Format a single card result as a human-readable string."
  [[entity-id result]]
  (let [lines (transient [(str "=== " (:name result) " [" entity-id "] ===")
                          (str "  Card ID: " (:card-id result))])
        {:keys [tables fields source-cards]} (:refs result)]
    (when (seq tables)
      (conj! lines (str "  Tables: " (str/join ", " tables))))
    (when (seq fields)
      (conj! lines (str "  Fields: " (str/join ", " fields))))
    (when (seq source-cards)
      (conj! lines (str "  Source Cards: " (str/join ", " source-cards))))
    (when-let [unresolved (:unresolved result)]
      (conj! lines "  UNRESOLVED REFERENCES:")
      (doseq [{:keys [type path entity-id name]} unresolved]
        (conj! lines (str "    - " (clojure.core/name type) ": "
                          (or (some->> path (str/join ".")) entity-id name)))))
    (when-let [native-errors (seq (:native-errors result))]
      (conj! lines "  NATIVE SQL ERRORS:")
      (doseq [err native-errors]
        (conj! lines (str "    - " (pr-str err)))))
    (conj! lines (case (result-status result)
                   :error        (str "  ERROR: " (:error result))
                   :unresolved   "  Status: MISSING REFS"
                   :native-errors "  Status: NATIVE SQL ERRORS"
                   :issues       (str "  Status: ISSUES FOUND\n"
                                      (str/join "\n" (map #(str "    - " (pr-str %)) (:bad-refs result))))
                   :ok           "  Status: OK"))
    (str/join "\n" (persistent! lines))))

(defn format-error
  "Format a single card error concisely for LLM consumption.
   Returns nil for :ok results. Only includes actionable error information."
  [[entity-id result]]
  (let [status (result-status result)]
    (when (not= :ok status)
      (let [lines (atom [(str "card: " (:name result) " (entity_id: " entity-id ")")])]
        (when-let [unresolved (seq (:unresolved result))]
          (doseq [{:keys [type path entity-id name]} unresolved]
            (swap! lines conj (str "  unresolved " (clojure.core/name type) ": "
                                   (or (some->> path (str/join ".")) entity-id name)))))
        (when (seq (:bad-refs result))
          (doseq [ref (:bad-refs result)]
            (swap! lines conj (str "  bad ref: " (pr-str ref)))))
        (when (seq (:native-errors result))
          (doseq [err (:native-errors result)]
            (swap! lines conj (str "  sql error: " (pr-str (dissoc err :source-entity-type :source-entity-id))))))
        (when (:error result)
          (swap! lines conj (str "  error: " (:error result))))
        (when-let [replacement (:suggested-replacement result)]
          (swap! lines conj (str "  suggested replacement entity_id: " replacement)))
        (str/join "\n" @lines)))))

(defn write-results!
  "Write results to a file in human-readable format."
  [results output-file]
  (with-open [w (io/writer output-file)]
    (doseq [entry (sort-by (comp :name second) results)]
      (.write w (str (format-result entry) "\n\n"))))
  (println "Results written to:" output-file))

(defn- make-source-and-index
  "Build a composite source (db schemas from `schema-dir`, cards from `export-dir`)
   and a merged file index."
  [export-dir schema-dir]
  (let [db-source    (serdes/make-database-source schema-dir)
        export-source (serdes/make-source export-dir)
        src          (source/composite-source db-source export-source)
        db-index     (serdes/source-index db-source)
        export-index (serdes/source-index export-source)
        index        (merge db-index (select-keys export-index [:card :dashboard :collection :duplicates]))]
    {:source src :index index :export-source export-source}))

(defn check
  "Check entities in an export directory against database schemas.

   `export-dir`  — directory containing serdes-exported entities (collections/)
   `schema-dir`  — directory containing serdes-exported database schemas
   `entity-ids`  — optional seq of card entity-ids to check (defaults to all cards)

   Returns a map with :results and :source."
  ([export-dir schema-dir]
   (let [{:keys [source index export-source]} (make-source-and-index export-dir schema-dir)
         card-ids (serdes/all-card-ids export-source)]
     {:results (check-cards source index card-ids)
      :source  source}))
  ([export-dir schema-dir entity-ids]
   (let [{:keys [source index]} (make-source-and-index export-dir schema-dir)]
     {:results (check-cards source index entity-ids)
      :source  source})))

(comment
  (def r (check "/path/to/export" "/path/to/schemas"))
  (summarize-results (:results r))

  (check "/path/to/export" "/path/to/schemas" ["some-entity-id"]))
