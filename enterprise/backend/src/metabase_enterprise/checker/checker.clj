(ns metabase-enterprise.checker.checker
  "CI checker for card queries.

   Validates cards using MLv2 (metabase.lib) without a database connection.
   Works with any MetadataSource implementation.

   Architecture:
   1. A *store* (atom) holds a MetadataSource, entity caches, and a bidirectional
      ID registry that maps portable refs ↔ synthetic integer IDs.
   2. Entities are loaded lazily from the source and cached with assigned IDs.
   3. A MetadataProvider backed by the store serves lib/query.
   4. lib/query and lib/find-bad-refs validate the cards.

   All mutable state lives in the store atom. There are no dynamic vars —
   the store is passed explicitly to every function that needs it."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.source :as source]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sql-parsing.core :as sql-parsing]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Store — source + ID registry + entity caches
;;; ===========================================================================

(defn make-store
  "Create a fresh store for a checking session.

   `enumerators` is a map of thunks that list all entities of each kind:
   :databases → (fn [] [\"db-name\" ...])
   :tables    → (fn [] [[\"db\" \"schema\" \"table\"] ...])
   :fields    → (fn [] [[\"db\" \"schema\" \"table\" \"field\"] ...])
   :cards     → (fn [] [\"entity-id\" ...])"
  [source enumerators]
  (atom {:source      source
         :enumerators enumerators
         :id-counter  0
         ;; Bidirectional ID registry, keyed by kind (:database, :table, :field, :card)
         :ref->id     {}   ; {kind {ref id}}
         :id->ref     {}   ; {kind {id ref}}
         ;; Entity caches (raw data from source, with :id stamped on)
         :entities    {}})) ; {kind {ref data}}

;;; ---------------------------------------------------------------------------
;;; ID registry — assign synthetic integer IDs to portable refs
;;; ---------------------------------------------------------------------------

(defn- next-id! [store]
  (:id-counter (swap! store update :id-counter inc)))

(defn- get-or-assign!
  "Return the integer ID for `ref` under `kind`, assigning one if needed."
  [store kind ref]
  (or (get-in @store [:ref->id kind ref])
      (let [id (next-id! store)]
        (swap! store (fn [s]
                       (-> s
                           (assoc-in [:ref->id kind ref] id)
                           (assoc-in [:id->ref kind id] ref))))
        id)))

(defn id->ref
  "Look up the portable ref for an integer ID. Returns nil if unknown."
  [store kind id]
  (get-in @store [:id->ref kind id]))

(defn ref->id
  "Look up the integer ID for a portable ref. Returns nil if not yet assigned."
  [store kind ref]
  (get-in @store [:ref->id kind ref]))

;;; ---------------------------------------------------------------------------
;;; Entity loading — lazy load from source, cache with assigned IDs
;;; ---------------------------------------------------------------------------

(defn- store-source [store] (:source @store))

(defn- cached-entity [store kind ref]
  (get-in @store [:entities kind ref]))

(defn- cache-entity! [store kind ref data]
  (swap! store assoc-in [:entities kind ref] data)
  data)

(defn load-database!
  "Load and cache a database, assigning it an integer ID. Returns data or nil."
  [store db-name]
  (or (cached-entity store :database db-name)
      (when-let [data (source/resolve-database (store-source store) db-name)]
        (let [id (get-or-assign! store :database db-name)]
          (cache-entity! store :database db-name (assoc data :id id))))))

(defn load-table!
  "Load and cache a table, assigning it and its database integer IDs."
  [store table-path]
  (or (cached-entity store :table table-path)
      (when-let [data (source/resolve-table (store-source store) table-path)]
        (let [[db-name _ _] table-path
              id    (get-or-assign! store :table table-path)
              db-id (get-or-assign! store :database db-name)]
          (cache-entity! store :table table-path (assoc data :id id :db_id db-id))))))

(defn load-field!
  "Load and cache a field, assigning it and its table integer IDs."
  [store field-path]
  (or (cached-entity store :field field-path)
      (when-let [data (source/resolve-field (store-source store) field-path)]
        (let [[db-name schema table-name _] field-path
              id       (get-or-assign! store :field field-path)
              table-id (get-or-assign! store :table [db-name schema table-name])]
          (cache-entity! store :field field-path (assoc data :id id :table_id table-id))))))

(defn load-card!
  "Load and cache a card, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :card entity-id)
      (when-let [data (source/resolve-card (store-source store) entity-id)]
        (let [id (get-or-assign! store :card entity-id)]
          (cache-entity! store :card entity-id (assoc data :id id))))))

;;; ===========================================================================
;;; Reference resolution — resolve portable refs to IDs, collecting failures
;;;
;;; Resolution functions take the store and an `unresolved` atom (or nil).
;;; When a ref can't be resolved, it's conj'd onto the atom for the caller
;;; to inspect.
;;; ===========================================================================

(defn- resolve-ref
  "Try to resolve `ref` of `kind`. Returns integer ID or nil.
   On failure, appends to `unresolved` atom (if provided)."
  [store kind ref unresolved failure-info]
  (when ref
    (or (ref->id store kind ref)
        (let [resolve-fn (case kind
                           :field    source/resolve-field
                           :table    source/resolve-table
                           :database source/resolve-database
                           :card     source/resolve-card)]
          (when (resolve-fn (store-source store) ref)
            (get-or-assign! store kind ref)))
        (do (when unresolved (swap! unresolved conj failure-info))
            nil))))

(defn- resolve-field-path [store unresolved field-path]
  (resolve-ref store :field field-path unresolved {:type :field :path field-path}))

(defn- resolve-table-path [store unresolved table-path]
  (resolve-ref store :table table-path unresolved {:type :table :path table-path}))

(defn- resolve-db-name [store unresolved db-name]
  (resolve-ref store :database db-name unresolved {:type :database :name db-name}))

(defn- resolve-card-entity-id [store unresolved entity-id]
  (resolve-ref store :card entity-id unresolved {:type :card :entity-id entity-id}))

;;; ---------------------------------------------------------------------------
;;; SerdesImportResolver — bridges store-based resolution into import-mbql
;;; ---------------------------------------------------------------------------

(defn- make-import-resolver
  "Build a `SerdesImportResolver` that resolves against `store`,
   collecting failures in `unresolved` (an atom, or nil to discard)."
  [store unresolved]
  (reify resolve/SerdesImportResolver
    (import-fk [_ eid model]
      (case model
        (Card Segment Measure) (resolve-card-entity-id store unresolved eid)
        (do (when unresolved
              (swap! unresolved conj {:type :unknown :model model :entity-id eid}))
            nil)))
    (import-fk-keyed [_ portable model field]
      (case [model field]
        [:model/Database :name] (resolve-db-name store unresolved portable)
        (do (when unresolved
              (swap! unresolved conj {:type :keyed-lookup :model model :field field :value portable}))
            nil)))
    (import-user [_ _email] nil)
    (import-table-fk [_ path] (resolve-table-path store unresolved path))
    (import-field-fk [_ path] (resolve-field-path store unresolved path))))

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
  [store unresolved data]
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
    (as-> m (if-let [fk-id (resolve-field-path store unresolved (:fk_target_field_id data))]
              (assoc m :fk-target-field-id fk-id)
              m))))

(defn- field-ref-has-nil? [ref]
  (and (vector? ref) (= :field (first ref)) (nil? (second ref))))

(defn- convert-result-metadata-column [resolver store unresolved col]
  (binding [resolve/*import-resolver* resolver]
    (cond-> col
      (vector? (:id col))
      (as-> c (if-let [id (resolve-field-path store unresolved (:id col))]
                (assoc c :id id) (dissoc c :id)))
      (vector? (:table_id col))
      (as-> c (if-let [id (resolve-table-path store unresolved (:table_id col))]
                (assoc c :table_id id) (dissoc c :table_id)))
      (vector? (:fk_target_field_id col))
      (as-> c (if-let [id (resolve-field-path store unresolved (:fk_target_field_id col))]
                (assoc c :fk_target_field_id id) (dissoc c :fk_target_field_id)))
      (:field_ref col)
      (as-> c (let [ref (resolve/import-mbql (:field_ref col))]
                (if (field-ref-has-nil? ref) (dissoc c :field_ref) (assoc c :field_ref ref)))))))

(defn- convert-dataset-query
  "Convert a dataset query from serdes format, resolving paths to IDs."
  [store unresolved query]
  (when query
    (let [db-name (:database query)
          db-id   (when (string? db-name) (resolve-db-name store unresolved db-name))
          query   (if db-id (assoc query :database db-id) query)
          resolver (make-import-resolver store unresolved)]
      (binding [resolve/*import-resolver* resolver]
        (resolve/import-mbql query)))))

(defn- ->card-metadata
  "Convert a cached card entity to lib metadata. Returns the metadata map with
   ::unresolved-refs and ::unresolved-database keys when resolution fails."
  [store data]
  (let [unresolved (atom [])
        resolver   (make-import-resolver store unresolved)
        table-id   (when-let [t (:table_id data)]
                     (if (vector? t)
                       (resolve-table-path store unresolved t)
                       t))
        db-name    (get-in data [:dataset_query :database])
        db-id      (when (string? db-name) (resolve-db-name store unresolved db-name))
        dataset-query   (convert-dataset-query store unresolved (:dataset_query data))
        result-metadata (when-let [cols (seq (:result_metadata data))]
                          (->> cols
                               (map (partial convert-result-metadata-column resolver store unresolved))
                               (lib/normalize [:sequential ::lib.schema.metadata/lib-or-legacy-column])))]
    (cond-> {:lib/type        :metadata/card
             :id              (:id data)
             :name            (:name data)
             :type            (some-> (:type data) keyword)
             :dataset-query   dataset-query
             :result-metadata result-metadata
             :archived        (:archived data)}
      db-id              (assoc :database-id db-id)
      (not db-id)        (assoc ::unresolved-database db-name)
      table-id           (assoc :table-id table-id)
      (seq @unresolved)  (assoc ::unresolved-refs (vec (distinct @unresolved))))))

;;; ===========================================================================
;;; MetadataProvider — serves lib/query from the store
;;; ===========================================================================

(defn- enumerator [store kind]
  (get-in @store [:enumerators kind]))

(deftype SourceMetadataProvider [store]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (when-let [db-name (first ((enumerator store :databases)))]
      (when-let [data (load-database! store db-name)]
        (->database-metadata data))))

  (metadatas [_this {:keys [lib/type id table-id]}]
    (case type
      :metadata/table
      (vec
       (if id
         (for [tid id
               :let [path (id->ref store :table tid)]
               :when path
               :let [data (load-table! store path)]
               :when data]
           (->table-metadata data))
         (for [path ((enumerator store :tables))
               :let [data (load-table! store path)]
               :when data]
           (->table-metadata data))))

      :metadata/column
      (vec
       (cond
         id
         (for [fid id
               :let [path (id->ref store :field fid)]
               :when path
               :let [data (load-field! store path)]
               :when data]
           (->field-metadata store nil data))

         table-id
         (let [[db schema tbl] (id->ref store :table table-id)]
           (when db
             (for [fpath ((enumerator store :fields))
                   :when (and (= db (first fpath))
                              (= schema (second fpath))
                              (= tbl (nth fpath 2)))
                   :let [data (load-field! store fpath)]
                   :when data]
               (->field-metadata store nil data))))

         :else
         (for [path ((enumerator store :fields))
               :let [data (load-field! store path)]
               :when data]
           (->field-metadata store nil data))))

      :metadata/card
      (vec
       (if id
         (for [cid id
               :let [eid (id->ref store :card cid)]
               :when eid
               :let [data (load-card! store eid)]
               :when data]
           (->card-metadata store data))
         (for [eid ((enumerator store :cards))
               :let [data (load-card! store eid)]
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
;;; Native SQL parsing — compile via QP then extract refs with SQLGlot
;;;
;;; Native queries can contain template tags ({{var}}, {{snippet:}}, {{#card}},
;;; [[optional]]) that aren't valid SQL. Rather than stripping these ourselves,
;;; we use the real QP compile path:
;;;   1. lib/add-parameters-for-template-tags — adds dummy param values
;;;   2. qp.compile/compile-with-inline-parameters — full compile with inlining
;;; This gives us clean, parseable SQL that SQLGlot can analyze.
;;; ===========================================================================

;; metabase.sql-tools.sqlglot.core/driver->dialect but don't want to bring in the dep
(def ^:private engine->dialect
  "Map engine names to SQLGlot dialect strings. nil means use default dialect."
  {"postgres"           "postgres"
   "mysql"              "mysql"
   "snowflake"          "snowflake"
   "bigquery"           "bigquery"
   "bigquery-cloud-sdk" "bigquery"
   "redshift"           "redshift"
   "sqlserver"          "tsql"
   "sparksql"           "spark"
   "presto-jdbc"        "presto"})

(defn- compile-query-to-sql
  "Compile a pMBQL query to SQL.

   For native-only queries: adds dummy parameter values for template tags
   and then uses compile-with-inline-parameters to produce clean SQL with
   {{tags}} and [[optionals]] resolved. Falls back to raw SQL extraction
   if the full compile path isn't available (e.g. test environments without
   driver implementations).

   For MBQL queries: uses the full QP compile path with the driver to
   generate SQL from the MBQL structure.

   Returns the compiled SQL string, or nil on failure."
  [driver query]
  (try
    (let [with-params (lib/add-parameters-for-template-tags query)
          compiled    (binding [driver/*driver* driver]
                        (qp.compile/compile-with-inline-parameters with-params))]
      (:query compiled))
    (catch Exception _
      ;; Fallback for native queries: extract raw SQL from the query stage.
      ;; This works when the full QP setup isn't available (no driver impls),
      ;; but won't resolve template tags.
      (when (lib/native-only-query? query)
        (:native (lib/query-stage query -1))))))

(defn- parse-sql-refs
  "Parse SQL string with SQLGlot, resolve refs against the store.
   Returns {:tables [...] :fields [...]}."
  [store db-name dialect sql]
  (let [raw-tables  (sql-parsing/referenced-tables dialect sql)
        raw-fields  (sql-parsing/referenced-fields dialect sql)
        table-paths (mapv (fn [[_cat schema table]]
                            [db-name schema table])
                          raw-tables)
        field-paths (mapv (fn [[_cat schema table field]]
                            [db-name schema table field])
                          raw-fields)]
    ;; Resolve each ref against the store so IDs get assigned
    ;; and lenient sources track them
    (doseq [tp table-paths]
      (load-table! store tp))
    (doseq [fp field-paths]
      (load-field! store fp))
    {:tables (mapv #(str/join "." (remove nil? %)) table-paths)
     :fields (mapv #(str/join "." (remove nil? %)) field-paths)}))

(defn- parse-native-sql-refs
  "Extract table and field references from a native query.

   Uses the full QP compile path to resolve template tags, parameters, etc.
   into clean SQL, then parses with SQLGlot.

   Resolves each discovered ref against the store so they get IDs assigned
   and (for lenient sources) get tracked in the manifest."
  [store db-name query]
  (let [engine  (:engine (cached-entity store :database db-name))
        driver  (keyword engine)
        dialect (get engine->dialect engine)
        sql     (compile-query-to-sql driver query)]
    (when sql
      (parse-sql-refs store db-name dialect sql))))

;;; ===========================================================================
;;; Card validation
;;; ===========================================================================

(defn- id->path
  "Convert an integer ID back to a human-readable path string for error messages."
  [store id id-type]
  (case id-type
    :table    (some->> (id->ref store :table id) (str/join "."))
    :field    (some->> (id->ref store :field id) (str/join "."))
    :card     (when-let [eid (id->ref store :card id)]
                (or (:name (cached-entity store :card eid)) eid))
    :database (id->ref store :database id)
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

(defn check-card
  "Check a single card. Returns result map with :name, :refs, :unresolved, :bad-refs, :error."
  [store provider entity-id]
  (let [data     (load-card! store entity-id)
        card-id  (:id data)
        card-meta (->card-metadata store data)]
    (if-let [missing-db (::unresolved-database card-meta)]
      {:card-id    card-id
       :name       (:name data)
       :entity-id  entity-id
       :unresolved (into [{:type :database :name missing-db}]
                         (::unresolved-refs card-meta))
       :error      (str "Unknown database: " missing-db)}
      (try
        (let [card      (lib.metadata/card provider card-id)
              query     (lib/query provider (:dataset-query card))
              refs      (extract-refs-from-query store query provider #{card-id})
              ;; Compile native queries to SQL via QP, then parse for table/field refs
              db-name   (get-in data [:dataset_query :database])
              sql-refs  (when (and (get-in data [:dataset_query :native :query]) db-name)
                          (parse-native-sql-refs store db-name query))
              ;; Merge MBQL refs with SQL-parsed refs
              refs      (if sql-refs
                          (-> refs
                              (update :tables into (:tables sql-refs))
                              (update :fields into (:fields sql-refs))
                              (update :tables #(vec (distinct %)))
                              (update :fields #(vec (distinct %))))
                          refs)
              bad-refs  (lib/find-bad-refs query)]
          {:card-id    card-id
           :name       (:name data)
           :entity-id  entity-id
           :refs       refs
           :unresolved (::unresolved-refs card-meta)
           :bad-refs   bad-refs})
        (catch Exception e
          {:card-id    card-id
           :name       (:name data)
           :entity-id  entity-id
           :unresolved (::unresolved-refs card-meta)
           :error      (.getMessage e)})))))

(defn check-cards
  "Check multiple cards from source. Returns map of entity-id → result.

   `enumerators` is a map of thunks for listing entities (see [[make-store]])."
  [source enumerators card-ids]
  (let [store    (make-store source enumerators)
        provider (make-provider store)]
    (into {}
          (for [eid card-ids]
            [eid (check-card store provider eid)]))))

;;; ===========================================================================
;;; Results processing — pure functions on result data
;;; ===========================================================================

(defn result-status
  "Compute the status of a single card result."
  [result]
  (cond
    (:error result)          :error
    (seq (:unresolved result)) :unresolved
    (seq (:bad-refs result))   :issues
    :else                      :ok))

(defn summarize-results
  "Summarize check results into counts by status."
  [results]
  (let [by-status (group-by (comp result-status second) results)]
    {:total      (count results)
     :ok         (count (get by-status :ok))
     :errors     (count (get by-status :error))
     :unresolved (count (get by-status :unresolved))
     :issues     (count (get by-status :issues))}))

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
    (conj! lines (case (result-status result)
                   :error      (str "  ERROR: " (:error result))
                   :unresolved "  Status: MISSING REFS"
                   :issues     (str "  Status: ISSUES FOUND\n"
                                    (str/join "\n" (map #(str "    - " (pr-str %)) (:bad-refs result))))
                   :ok         "  Status: OK"))
    (str/join "\n" (persistent! lines))))

(defn write-results!
  "Write results to a file in human-readable format."
  [results output-file]
  (with-open [w (io/writer output-file)]
    (doseq [entry (sort-by (comp :name second) results)]
      (.write w (str (format-result entry) "\n\n"))))
  (println "Results written to:" output-file))

(defn check
  "Check cards in an export directory (auto-detects format).

   With just an export dir, checks all cards.
   With entity-ids, checks only those cards.

   Options: :lenient? true to force lenient mode.

   Returns a map with :results, :type, and :source (see hybrid/check)."
  ([export-dir]
   (let [hybrid-check (requiring-resolve 'metabase-enterprise.checker.format.hybrid/check)]
     (hybrid-check export-dir)))
  ([export-dir entity-ids]
   (check export-dir entity-ids {}))
  ([export-dir entity-ids {:keys [lenient?]}]
   (let [make-source*      (requiring-resolve 'metabase-enterprise.checker.format.hybrid/make-source)
         make-enumerators* (requiring-resolve 'metabase-enterprise.checker.format.hybrid/make-enumerators)
         {:keys [source type] :as src-info} (make-source* export-dir :lenient? lenient?)
         enums (make-enumerators* src-info)]
     {:results (check-cards source enums entity-ids)
      :type    type
      :source  source})))

(comment
  ;; Quick check — all cards, auto-detect format
  (def check-result (check "/Users/dan/projects/work/yaml-checked-files-v1/exports/sqlite-based-mixed-versions"))
  (summarize-results (:results check-result))

  ;; Check just one card
  (check "/path/to/export" ["some-entity-id"])

  ;; Dig into the store to see what got loaded
  (require '[metabase-enterprise.checker.format.serdes :as serdes-format])
  (def source (serdes-format/make-source "/path/to/export"))
  (def store (make-store source (serdes-format/make-enumerators source)))
  (load-database! store "My Database")
  (load-table! store ["My Database" "PUBLIC" "ORDERS"])
  (:ref->id @store)   ; all assigned IDs
  (:entities @store)   ; all cached entities
  )
