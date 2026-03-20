(ns metabase-enterprise.checker.checker
  "CI checker for card queries.

   Validates cards using MLv2 (metabase.lib) without a database connection.
   Works with any MetadataSource implementation.

   Architecture:
   1. Source provides entity data (resolve-database, resolve-table, etc.)
   2. Checker assigns integer IDs (lib requires them)
   3. Checker builds a MetadataProvider from source data
   4. lib/query and lib/find-bad-refs validate the cards

   ID assignment is necessary because lib expects integer IDs, but sources
   use portable references (strings, paths). We maintain bidirectional mappings
   so we can convert back to human-readable paths for error reporting."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.source :as source]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.serialization.resolve :as resolve]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Session State
;;;
;;; Holds ID mappings and cached conversions for a checking session.
;;; Created fresh for each check run via make-session.
;;; ===========================================================================

(defn- make-session
  "Create a fresh session for checking.

   enumerators is a map of functions for listing entities:
   - :databases - fn [] returning seq of db-names
   - :tables    - fn [] returning seq of table-paths
   - :fields    - fn [] returning seq of field-paths
   - :cards     - fn [] returning seq of card entity-ids"
  [source enumerators]
  (atom {:source source
         :enumerators enumerators
         :id-counter 0
         ;; Forward mappings: portable ref -> integer ID
         :db-name->id {}
         :table-path->id {}
         :field-path->id {}
         :card-entity-id->id {}
         ;; Reverse mappings: integer ID -> portable ref
         :id->db-name {}
         :id->table-path {}
         :id->field-path {}
         :id->card-entity-id {}
         ;; Cached entity data (with :id assigned)
         :databases {}
         :tables {}
         :fields {}
         :cards {}}))

;;; ===========================================================================
;;; ID Assignment
;;;
;;; IDs are positive integers assigned on first reference.
;;; We maintain bidirectional mappings for lookups.
;;; ===========================================================================

(defn- next-id! [session]
  (:id-counter (swap! session update :id-counter inc)))

(defn- assign-id! [session forward-key reverse-key path-or-name]
  (or (get-in @session [forward-key path-or-name])
      (let [id (next-id! session)]
        (swap! session #(-> %
                            (assoc-in [forward-key path-or-name] id)
                            (assoc-in [reverse-key id] path-or-name)))
        id)))

(defn- get-or-assign-db-id! [session db-name]
  (assign-id! session :db-name->id :id->db-name db-name))

(defn- get-or-assign-table-id! [session table-path]
  (assign-id! session :table-path->id :id->table-path table-path))

(defn- get-or-assign-field-id! [session field-path]
  (assign-id! session :field-path->id :id->field-path field-path))

(defn- get-or-assign-card-id! [session entity-id]
  (assign-id! session :card-entity-id->id :id->card-entity-id entity-id))

;;; ===========================================================================
;;; Entity Loading
;;;
;;; Load from source and cache with assigned IDs.
;;; ===========================================================================

(defn- load-database!
  "Load database from source, assign ID, cache. Returns data with :id or nil."
  [session db-name]
  (or (get-in @session [:databases db-name])
      (when-let [data (source/resolve-database (:source @session) db-name)]
        (let [id (get-or-assign-db-id! session db-name)
              result (assoc data :id id)]
          (swap! session assoc-in [:databases db-name] result)
          result))))

(defn- load-table!
  "Load table from source, assign ID and db_id, cache."
  [session table-path]
  (or (get-in @session [:tables table-path])
      (when-let [data (source/resolve-table (:source @session) table-path)]
        (let [[db-name _ _] table-path
              id (get-or-assign-table-id! session table-path)
              db-id (get-or-assign-db-id! session db-name)
              result (assoc data :id id :db_id db-id)]
          (swap! session assoc-in [:tables table-path] result)
          result))))

(defn- load-field!
  "Load field from source, assign ID and table_id, cache."
  [session field-path]
  (or (get-in @session [:fields field-path])
      (when-let [data (source/resolve-field (:source @session) field-path)]
        (let [[db-name schema table-name _] field-path
              id (get-or-assign-field-id! session field-path)
              table-id (get-or-assign-table-id! session [db-name schema table-name])
              result (assoc data :id id :table_id table-id)]
          (swap! session assoc-in [:fields field-path] result)
          result))))

(defn- load-card!
  "Load card from source, assign ID, cache."
  [session entity-id]
  (or (get-in @session [:cards entity-id])
      (when-let [data (source/resolve-card (:source @session) entity-id)]
        (let [id (get-or-assign-card-id! session entity-id)
              result (assoc data :id id)]
          (swap! session assoc-in [:cards entity-id] result)
          result))))

;;; ===========================================================================
;;; Reference Resolution
;;;
;;; Resolve portable refs to IDs, tracking unresolved ones.
;;; ===========================================================================

(def ^:dynamic *session*
  "Current checking session."
  nil)

(def ^:dynamic *unresolved-refs*
  "Bound to an atom during query conversion to collect unresolved references."
  nil)

(defn- resolve-field-path [field-path]
  (when field-path
    (or (get-in @*session* [:field-path->id field-path])
        (when (source/resolve-field (:source @*session*) field-path)
          (get-or-assign-field-id! *session* field-path))
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :field :path field-path}))
            nil))))

(defn- resolve-table-path [table-path]
  (when table-path
    (or (get-in @*session* [:table-path->id table-path])
        (when (source/resolve-table (:source @*session*) table-path)
          (get-or-assign-table-id! *session* table-path))
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :table :path table-path}))
            nil))))

(defn- resolve-db-name [db-name]
  (when db-name
    (or (get-in @*session* [:db-name->id db-name])
        (when (source/resolve-database (:source @*session*) db-name)
          (get-or-assign-db-id! *session* db-name))
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :database :name db-name}))
            nil))))

(defn- resolve-card-entity-id [entity-id]
  (when entity-id
    (or (get-in @*session* [:card-entity-id->id entity-id])
        (when (source/resolve-card (:source @*session*) entity-id)
          (get-or-assign-card-id! *session* entity-id))
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :card :entity-id entity-id}))
            nil))))

;; Serdes import callbacks - these are called by serdes/import-mbql
(defn- import-field-fk [path] (resolve-field-path path))
(defn- import-table-fk [path] (resolve-table-path path))
(defn- import-fk [entity-id model]
  (case model
    ;; these are intentionally symbol lookups, not vars. case does not use runtime values
    (Card Segment Measure) (resolve-card-entity-id entity-id)
    (do (when *unresolved-refs*
          (swap! *unresolved-refs* conj {:type :unknown :model model :entity-id entity-id}))
        nil)))
(defn- import-fk-keyed [portable model field]
  (case [model field]
    [:model/Database :name] (resolve-db-name portable)
    (do (when *unresolved-refs*
          (swap! *unresolved-refs* conj {:type :keyed-lookup :model model :field field :value portable}))
        nil)))

;; TODO: Make this stateful — hold the session atom directly instead of closing
;; over `*session*` and `*unresolved-refs*` dynamic vars. That would let callers
;; bind just `resolve/*import-resolver*` instead of three separate dynamic vars.
;; Blocked on `*session*` being used throughout the rest of this file.
(def ^:private checker-import-resolver
  (reify resolve/SerdesImportResolver
    (import-fk        [_ eid model]            (import-fk eid model))
    (import-fk-keyed  [_ portable model field] (import-fk-keyed portable model field))
    (import-user      [_ _email]               nil) ; checker doesn't resolve users
    (import-table-fk  [_ path]                 (import-table-fk path))
    (import-field-fk  [_ path]                 (import-field-fk path))))

;;; ===========================================================================
;;; Data Conversion (serdes YAML -> lib metadata)
;;;
;;; These functions know about serdes YAML format. A different source format
;;; would need different converters.
;;; ===========================================================================

(defn- yaml->database-metadata [yaml]
  {:lib/type :metadata/database
   :id (:id yaml)
   :name (:name yaml)
   :engine (keyword (:engine yaml))
   :dbms-version (:dbms_version yaml)
   :features #{:foreign-keys :nested-queries :expressions :native-parameters
               :basic-aggregations :standard-deviation-aggregations
               :expression-aggregations :left-join :right-join :inner-join :full-join}
   :settings (:settings yaml)})

(defn- yaml->table-metadata [yaml]
  {:lib/type :metadata/table
   :id (:id yaml)
   :name (:name yaml)
   :display-name (:display_name yaml)
   :schema (:schema yaml)
   :db-id (:db_id yaml)
   :active (if (contains? yaml :active) (:active yaml) true)
   :visibility-type (some-> (:visibility_type yaml) keyword)})

(defn- yaml->field-metadata [yaml]
  (cond-> {:lib/type :metadata/column
           :id (:id yaml)
           :table-id (:table_id yaml)
           :name (:name yaml)
           :display-name (:display_name yaml)
           :base-type (keyword (:base_type yaml))
           :effective-type (some-> (:effective_type yaml) keyword)
           :semantic-type (some-> (:semantic_type yaml) keyword)
           :database-type (:database_type yaml)
           :active (if (contains? yaml :active) (:active yaml) true)
           :visibility-type (some-> (:visibility_type yaml) keyword)
           :position (:position yaml)}
    (vector? (:fk_target_field_id yaml))
    (as-> m (if-let [fk-id (resolve-field-path (:fk_target_field_id yaml))]
              (assoc m :fk-target-field-id fk-id)
              m))))

(defn- convert-dataset-query
  "Convert a dataset query from serdes format, resolving paths to IDs."
  [query]
  (when query
    (let [db-name (:database query)
          db-id (when (string? db-name) (resolve-db-name db-name))
          query (if db-id (assoc query :database db-id) query)]
      (binding [resolve/*import-resolver* checker-import-resolver]
        (resolve/import-mbql query)))))

(defn- field-ref-has-nil? [ref]
  (and (vector? ref) (= :field (first ref)) (nil? (second ref))))

(defn- convert-result-metadata-column [col]
  (binding [resolve/*import-resolver* checker-import-resolver]
    (cond-> col
      (vector? (:id col))
      (as-> c (if-let [id (import-field-fk (:id col))]
                (assoc c :id id) (dissoc c :id)))
      (vector? (:table_id col))
      (as-> c (if-let [id (import-table-fk (:table_id col))]
                (assoc c :table_id id) (dissoc c :table_id)))
      (vector? (:fk_target_field_id col))
      (as-> c (if-let [id (import-field-fk (:fk_target_field_id col))]
                (assoc c :fk_target_field_id id) (dissoc c :fk_target_field_id)))
      (:field_ref col)
      (as-> c (let [ref (resolve/import-mbql (:field_ref col))]
                (if (field-ref-has-nil? ref) (dissoc c :field_ref) (assoc c :field_ref ref)))))))

(defn- normalize-result-metadata [cols]
  (when (seq cols)
    (->> cols
         (map convert-result-metadata-column)
         (lib/normalize [:sequential ::lib.schema.metadata/lib-or-legacy-column]))))

(defn- yaml->card-metadata
  "Convert card YAML to lib metadata. Tracks unresolved refs in ::unresolved-refs."
  [yaml]
  (let [unresolved (atom [])
        table-id (when-let [t (:table_id yaml)]
                   (if (vector? t)
                     (binding [*unresolved-refs* unresolved] (resolve-table-path t))
                     t))
        db-name (get-in yaml [:dataset_query :database])
        db-id (when (string? db-name)
                (binding [*unresolved-refs* unresolved] (resolve-db-name db-name)))
        dataset-query (binding [*unresolved-refs* unresolved]
                        (convert-dataset-query (:dataset_query yaml)))
        result-metadata (binding [*unresolved-refs* unresolved]
                          (normalize-result-metadata (:result_metadata yaml)))]
    (cond-> {:lib/type :metadata/card
             :id (:id yaml)
             :name (:name yaml)
             :type (some-> (:type yaml) keyword)
             :dataset-query dataset-query
             :result-metadata result-metadata
             :archived (:archived yaml)}
      db-id (assoc :database-id db-id)
      (not db-id) (assoc ::unresolved-database db-name)
      table-id (assoc :table-id table-id)
      (seq @unresolved) (assoc ::unresolved-refs (vec (distinct @unresolved))))))

;;; ===========================================================================
;;; Metadata Provider
;;;
;;; Implements lib.metadata.protocols for use with lib/query.
;;; ===========================================================================

(defn- session-source [session]
  (:source @session))

(defn- session-enumerator [session key]
  (get-in @session [:enumerators key]))

(deftype SourceMetadataProvider [session]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (binding [*session* session]
      ;; Get first database from source
      (when-let [db-name (first ((session-enumerator session :databases)))]
        (when-let [data (load-database! session db-name)]
          (yaml->database-metadata data)))))

  (metadatas [_this {:keys [lib/type id table-id]}]
    ;; Use vec to force eager evaluation while *session* is bound
    (binding [*session* session]
      (case type
        :metadata/table
        (vec
         (if id
           (for [tid id
                 :let [path (get-in @session [:id->table-path tid])]
                 :when path
                 :let [data (load-table! session path)]
                 :when data]
             (yaml->table-metadata data))
           (for [path ((session-enumerator session :tables))
                 :let [data (load-table! session path)]
                 :when data]
             (yaml->table-metadata data))))

        :metadata/column
        (vec
         (cond
           id (for [fid id
                    :let [path (get-in @session [:id->field-path fid])]
                    :when path
                    :let [data (load-field! session path)]
                    :when data]
                (yaml->field-metadata data))
           table-id (let [tpath (get-in @session [:id->table-path table-id])
                          [db schema tbl] tpath]
                      (when tpath
                        (for [fpath ((session-enumerator session :fields))
                              :when (and (= db (first fpath))
                                         (= schema (second fpath))
                                         (= tbl (nth fpath 2)))
                              :let [data (load-field! session fpath)]
                              :when data]
                          (yaml->field-metadata data))))
           :else (for [path ((session-enumerator session :fields))
                       :let [data (load-field! session path)]
                       :when data]
                   (yaml->field-metadata data))))

        :metadata/card
        (vec
         (if id
           (for [cid id
                 :let [eid (get-in @session [:id->card-entity-id cid])]
                 :when eid
                 :let [data (load-card! session eid)]
                 :when data]
             (yaml->card-metadata data))
           (for [eid ((session-enumerator session :cards))
                 :let [data (load-card! session eid)]
                 :when data]
             (yaml->card-metadata data))))

        nil)))

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
  "Create a MetadataProvider for checking cards from source."
  [session]
  (->SourceMetadataProvider session))

;;; ===========================================================================
;;; Card Validation
;;; ===========================================================================

(defn- id->path
  "Convert an integer ID back to a human-readable path string."
  [session id id-type]
  (case id-type
    :table (some->> (get-in @session [:id->table-path id]) (str/join "."))
    :field (some->> (get-in @session [:id->field-path id]) (str/join "."))
    :card (when-let [eid (get-in @session [:id->card-entity-id id])]
            (or (:name (get-in @session [:cards eid])) eid))
    :database (get-in @session [:id->db-name id])
    nil))

(declare extract-refs-from-card)

(defn- extract-refs-from-query
  ([session query] (extract-refs-from-query session query nil #{}))
  ([session query provider visited]
   (let [table-ids (lib/all-source-table-ids query)
         card-ids (lib/all-source-card-ids query)
         cols (try (lib/returned-columns query) (catch Exception _ nil))
         tables (mapv #(id->path session % :table) table-ids)
         fields (when cols (->> cols (keep :id) (mapv #(id->path session % :field))))
         cards (mapv #(id->path session % :card) card-ids)
         transitive (when provider
                      (for [cid card-ids :when (not (visited cid))]
                        (extract-refs-from-card session provider cid (conj visited cid))))
         all-tables (into (vec (remove nil? tables)) (mapcat :tables transitive))
         all-fields (into (vec (remove nil? fields)) (mapcat :fields transitive))
         all-cards (into (vec (remove nil? cards)) (mapcat :source-cards transitive))]
     {:tables (vec (distinct all-tables))
      :fields (vec (distinct all-fields))
      :source-cards (vec (distinct all-cards))})))

(defn- extract-refs-from-card [session provider card-id visited]
  (try
    (when-let [card (lib.metadata/card provider card-id)]
      (when-let [dq (:dataset-query card)]
        (extract-refs-from-query session (lib/query provider dq) provider visited)))
    (catch Exception _ {:tables [] :fields [] :source-cards []})))

(defn check-card
  "Check a single card. Returns result map with :name, :refs, :unresolved, :bad-refs, :error."
  [session provider entity-id]
  (binding [*session* session]
    (let [data (load-card! session entity-id)
          card-id (:id data)
          card-meta (yaml->card-metadata data)]
      (if-let [missing-db (::unresolved-database card-meta)]
        {:card-id card-id
         :name (:name data)
         :entity-id entity-id
         :unresolved (into [{:type :database :name missing-db}]
                           (::unresolved-refs card-meta))
         :error (str "Unknown database: " missing-db)}
        (try
          (let [card (lib.metadata/card provider card-id)
                query (lib/query provider (:dataset-query card))
                refs (extract-refs-from-query session query provider #{card-id})
                bad-refs (lib/find-bad-refs query)]
            {:card-id card-id
             :name (:name data)
             :entity-id entity-id
             :refs refs
             :unresolved (::unresolved-refs card-meta)
             :bad-refs bad-refs})
          (catch Exception e
            {:card-id card-id
             :name (:name data)
             :entity-id entity-id
             :unresolved (::unresolved-refs card-meta)
             :error (.getMessage e)}))))))

(defn check-cards
  "Check multiple cards from source. Returns map of entity-id -> result.

   enumerators is a map of functions for listing entities (used by MetadataProvider):
   - :databases - fn [] returning seq of db-names
   - :tables    - fn [] returning seq of table-paths
   - :fields    - fn [] returning seq of field-paths
   - :cards     - fn [] returning seq of card entity-ids"
  [source enumerators card-ids]
  (let [session (make-session source enumerators)
        provider (make-provider session)]
    (into {}
          (for [eid card-ids]
            [eid (check-card session provider eid)]))))

;;; ===========================================================================
;;; Results Processing
;;; ===========================================================================

(defn result-status
  "Compute the status of a single card result."
  [result]
  (cond
    (:error result) :error
    (seq (:unresolved result)) :unresolved
    (seq (:bad-refs result)) :issues
    :else :ok))

(defn summarize-results
  "Summarize check results into counts by status."
  [results]
  (let [by-status (group-by (comp result-status second) results)]
    {:total (count results)
     :ok (count (get by-status :ok))
     :errors (count (get by-status :error))
     :unresolved (count (get by-status :unresolved))
     :issues (count (get by-status :issues))}))

(defn results-by-status
  "Group results by status. Returns map of status -> seq of [entity-id result]."
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
                   :error (str "  ERROR: " (:error result))
                   :unresolved "  Status: MISSING REFS"
                   :issues (str "  Status: ISSUES FOUND\n"
                                (str/join "\n" (map #(str "    - " (pr-str %)) (:bad-refs result))))
                   :ok "  Status: OK"))
    (str/join "\n" (persistent! lines))))

(defn write-results!
  "Write results to a file in human-readable format."
  [results output-file]
  (with-open [w (io/writer output-file)]
    (doseq [entry (sort-by (comp :name second) results)]
      (.write w (str (format-result entry) "\n\n"))))
  (println "Results written to:" output-file))

(comment
  (require '[metabase-enterprise.checker.format.serdes :as serdes-format])

  ;; Check a serdes export
  (def source (serdes-format/make-source "export-dir"))
  (def results (serdes-format/check source))
  (summarize-results results)

  ;; Check specific cards
  (def enumerators (serdes-format/make-enumerators source))
  (check-cards source enumerators ["card-entity-id-1" "card-entity-id-2"])

  ;; Write report
  (write-results! results "/tmp/check-results.txt"))
