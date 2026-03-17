(ns metabase-enterprise.checker.checker
  "CI checker for serdes YAML exports.

   Architecture:
   1. File Index (built once on first access)
      - Traverses export directory to build path -> file mappings
      - For databases/tables/fields: uses directory structure + YAML name field
      - For cards: extracts entity_id from each card YAML file
      - This is the only full traversal; everything else is on-demand

   2. Lazy Loading
      - YAML content is parsed only when an entity is accessed
      - IDs are assigned on first reference (whether from index or query)
      - Parsed content is cached in state

   3. Reference Resolution
      - When converting card queries, we look up paths in the file index
      - If path exists in index: assign an ID (entity is known)
      - If path doesn't exist: track as unresolved reference (broken ref)

   4. Validation
      - Uses lib/query and lib/find-bad-refs to validate cards
      - Reports unresolved references (missing tables/fields/cards)
      - Reports any structural issues found by lib

   5. Composability
      - The `*resolvers*` dynamic var allows injecting custom resolution functions
      - Default resolvers use the file index; tests can provide alternatives
      - Resolvers map: {:database fn, :table fn, :field fn, :card fn}
      - Each resolver fn takes a path/name and returns an ID or nil"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; State
;;;
;;; Single atom holding all state: file index, ID mappings, and cached content.
;;; ===========================================================================

(defonce ^:private state
  (atom nil))

(defn- initial-state []
  {:export-dir nil
   :file-index-built? false

   ;; File index: path -> file location (built once, read-only after)
   :db-name->file {}           ; "Sample Database" -> "/path/to/Sample Database.yaml"
   :table-path->file {}        ; ["Sample Database" "PUBLIC" "ORDERS"] -> "/path/to/ORDERS.yaml"
   :field-path->file {}        ; ["Sample Database" "PUBLIC" "ORDERS" "ID"] -> "/path/to/ID.yaml"
   :card-entity-id->file {}    ; "abc123" -> "/path/to/card.yaml"

   ;; ID mappings: assigned on first reference, bidirectional for lookups
   :id-counter 0
   :db-name->id {}             :id->db-name {}
   :table-path->id {}          :id->table-path {}
   :field-path->id {}          :id->field-path {}
   :card-entity-id->id {}      :id->card-entity-id {}

   ;; Parsed YAML cache: loaded on demand
   :databases {}               ; db-name -> parsed yaml with :id
   :tables {}                  ; table-path -> parsed yaml with :id, :db_id
   :fields {}                  ; field-path -> parsed yaml with :id, :table_id
   :cards {}})                 ; entity-id -> parsed yaml with :id

(defn reset-state!
  "Reset all state. Call before switching export directories."
  []
  (reset! state (initial-state)))

;; Initialize state on load
(when-not @state (reset-state!))

;;; ===========================================================================
;;; ID Assignment
;;;
;;; IDs are positive integers assigned on first reference.
;;; We maintain bidirectional mappings for lookups.
;;; ===========================================================================

(defn- next-id! []
  (:id-counter (swap! state update :id-counter inc)))

(defn- assign-id! [forward-key reverse-key path-or-name]
  (or (get-in @state [forward-key path-or-name])
      (let [id (next-id!)]
        (swap! state #(-> %
                          (assoc-in [forward-key path-or-name] id)
                          (assoc-in [reverse-key id] path-or-name)))
        id)))

(defn- get-or-assign-db-id! [db-name]
  (assign-id! :db-name->id :id->db-name db-name))

(defn- get-or-assign-table-id! [table-path]
  (assign-id! :table-path->id :id->table-path table-path))

(defn- get-or-assign-field-id! [field-path]
  (assign-id! :field-path->id :id->field-path field-path))

(defn- get-or-assign-card-id! [entity-id]
  (assign-id! :card-entity-id->id :id->card-entity-id entity-id))

;;; ===========================================================================
;;; File Index
;;;
;;; Built once on first access. Maps paths to file locations.
;;;
;;; NOTE: Currently indexes all databases/tables/fields upfront. This could be
;;; optimized to lazy-load on demand since paths are predictable:
;;;   databases/<db>/schemas/<schema>/tables/<table>/fields/<field>.yaml
;;;
;;; Cards must be indexed (entity_id doesn't map to a predictable path).
;;; Tables/fields could be resolved on-demand and cached. For "list all fields
;;; in table X" we'd do a directory listing at that point.
;;;
;;; If memory becomes a concern for large exports, consider:
;;; - Lazy loading with LRU/bounded cache for parsed YAML
;;; - Only index cards, resolve table/field paths on demand
;;;
;;; TODO: The "get all fields for table" lookup in metadatas is O(n) over all
;;; fields. Restructure to nest fields under tables:
;;;   :table-fields {table-path {field-name -> file}}
;;; Field-path lookup: (get-in state [:table-fields (pop path) (peek path)])
;;; Table fields lookup: (get-in state [:table-fields table-path])
;;; ===========================================================================

(defn- load-yaml [path]
  (yaml/parse-string (slurp path)))

(defn- quick-extract
  "Extract a field from YAML using regex (fast) with full parse fallback."
  [file-path field-name pattern]
  (try
    (let [content (slurp file-path)]
      (if-let [[_ value] (re-find pattern content)]
        (str/trim value)
        (get (yaml/parse-string content) (keyword field-name))))
    (catch Exception _ nil)))

(defn- extract-name [file-path]
  (quick-extract file-path "name" #"(?m)^name:\s*(.+)$"))

(defn- extract-entity-id [file-path]
  (quick-extract file-path "entity_id" #"(?m)^entity_id:\s*(\S+)"))

(defn- build-file-index!
  "Traverse export directory once to build path -> file mappings."
  [export-dir]
  ;; Index databases, tables, and fields
  (let [db-dir (io/file export-dir "databases")]
    (when (.exists db-dir)
      (doseq [^File db-folder (.listFiles db-dir)
              :when (.isDirectory db-folder)
              :let [folder-name (.getName db-folder)
                    db-yaml-file (io/file db-folder (str folder-name ".yaml"))]
              :when (.exists db-yaml-file)
              :let [db-name folder-name]]
        ;; Index database
        (swap! state assoc-in [:db-name->file db-name] (.getPath db-yaml-file))
        ;; Index tables and fields - two possible structures:
        ;; 1. With schemas: databases/<db>/schemas/<schema>/tables/<table>/
        ;; 2. Without schemas: databases/<db>/tables/<table>/ (schema is null in paths)
        (let [schemas-dir (io/file db-folder "schemas")
              tables-dir-no-schema (io/file db-folder "tables")]
          ;; Handle databases with schemas
          (when (.exists schemas-dir)
            (doseq [^File schema-dir (.listFiles schemas-dir)
                    :when (.isDirectory schema-dir)
                    :let [schema-name (.getName schema-dir)
                          tables-dir (io/file schema-dir "tables")]
                    :when (.exists tables-dir)
                    ^File table-dir (.listFiles tables-dir)
                    :when (.isDirectory table-dir)
                    :let [table-name (.getName table-dir)
                          ;; todo: what about cloud dbs with pattern:
                          ;; [ catalog db-name schema tablename ]
                          table-path [db-name schema-name table-name]
                          table-yaml (io/file table-dir (str table-name ".yaml"))]]
              ;; Index table
              (when (.exists table-yaml)
                (swap! state assoc-in [:table-path->file table-path] (.getPath table-yaml)))
              ;; Index fields
              (let [fields-dir (io/file table-dir "fields")]
                (when (.exists fields-dir)
                  (doseq [^File field-file (.listFiles fields-dir)
                          :when (.isFile field-file)
                          :when (str/ends-with? (.getName field-file) ".yaml")
                          :when (not (str/includes? (.getName field-file) "___"))
                          :let [field-name (str/replace (.getName field-file) ".yaml" "")
                                field-path [db-name schema-name table-name field-name]]]
                    (swap! state assoc-in [:field-path->file field-path] (.getPath field-file)))))))
          ;; Handle databases without schemas (tables directly under db folder)
          (when (.exists tables-dir-no-schema)
            (doseq [^File table-dir (.listFiles tables-dir-no-schema)
                    :when (.isDirectory table-dir)
                    :let [table-name (.getName table-dir)
                          ;; Schema is nil for schema-less databases
                          table-path [db-name nil table-name]
                          table-yaml (io/file table-dir (str table-name ".yaml"))]]
              ;; Index table
              (when (.exists table-yaml)
                (swap! state assoc-in [:table-path->file table-path] (.getPath table-yaml)))
              ;; Index fields
              (let [fields-dir (io/file table-dir "fields")]
                (when (.exists fields-dir)
                  (doseq [^File field-file (.listFiles fields-dir)
                          :when (.isFile field-file)
                          :when (str/ends-with? (.getName field-file) ".yaml")
                          :when (not (str/includes? (.getName field-file) "___"))
                          :let [field-name (str/replace (.getName field-file) ".yaml" "")
                                ;; Schema is nil for schema-less databases
                                field-path [db-name nil table-name field-name]]]
                    (swap! state assoc-in [:field-path->file field-path] (.getPath field-file)))))))))))
  ;; Index cards (separate traversal since they're in collections)
  (doseq [^File file (file-seq (io/file export-dir))
          :when (.isFile file)
          :when (re-matches #".*/cards/[^/]+\.yaml$" (.getPath file))
          :let [entity-id (extract-entity-id (.getPath file))]
          :when entity-id]
    (swap! state assoc-in [:card-entity-id->file entity-id] (.getPath file)))
  (swap! state assoc :file-index-built? true :export-dir export-dir))

(defn- ensure-index!
  "Ensure file index is built for the given export directory."
  [export-dir]
  (when (or (not (:file-index-built? @state))
            (not= export-dir (:export-dir @state)))
    (reset-state!)
    (build-file-index! export-dir)))

(defn build-index!
  "Build file index for the given export directory. Resets state if switching directories."
  [export-dir]
  (ensure-index! export-dir))

;;; ===========================================================================
;;; Lazy Entity Loading
;;;
;;; Load and cache YAML content on demand.
;;; ===========================================================================

(defn- ensure-database!
  "Load database if not cached. Returns parsed YAML with :id, or nil."
  [db-name]
  (or (get-in @state [:databases db-name])
      (when-let [file (get-in @state [:db-name->file db-name])]
        (let [yaml (load-yaml file)
              id (get-or-assign-db-id! db-name)
              result (assoc yaml :id id)]
          (swap! state assoc-in [:databases db-name] result)
          result))))

(defn- ensure-table!
  "Load table if not cached. Returns parsed YAML with :id and :db_id, or nil."
  [table-path]
  (or (get-in @state [:tables table-path])
      (when-let [file (get-in @state [:table-path->file table-path])]
        (let [[db-name _ _] table-path
              yaml (load-yaml file)
              id (get-or-assign-table-id! table-path)
              db-id (get-or-assign-db-id! db-name)
              result (assoc yaml :id id :db_id db-id)]
          (swap! state assoc-in [:tables table-path] result)
          result))))

(defn- ensure-field!
  "Load field if not cached. Returns parsed YAML with :id and :table_id, or nil."
  [field-path]
  (or (get-in @state [:fields field-path])
      (when-let [file (get-in @state [:field-path->file field-path])]
        (let [[db-name schema table-name _] field-path
              yaml (load-yaml file)
              id (get-or-assign-field-id! field-path)
              table-id (get-or-assign-table-id! [db-name schema table-name])
              result (assoc yaml :id id :table_id table-id)]
          (swap! state assoc-in [:fields field-path] result)
          result))))

(defn- ensure-card!
  "Load card if not cached. Returns parsed YAML with :id, or nil."
  [entity-id]
  (or (get-in @state [:cards entity-id])
      (when-let [file (get-in @state [:card-entity-id->file entity-id])]
        (let [yaml (load-yaml file)
              id (get-or-assign-card-id! entity-id)
              result (assoc yaml :id id)]
          (swap! state assoc-in [:cards entity-id] result)
          result))))

;;; ===========================================================================
;;; Reference Resolution
;;;
;;; When converting queries, resolve paths to IDs.
;;; Track unresolved references for reporting.
;;;
;;; Resolvers are composable: bind *resolvers* to customize resolution behavior.
;;; ===========================================================================

(def ^:dynamic *unresolved-refs*
  "Bound to an atom during query conversion to collect unresolved references."
  nil)

(defn- default-resolve-field
  "Default field resolver using file index."
  [field-path]
  (or (get-in @state [:field-path->id field-path])
      (when (get-in @state [:field-path->file field-path])
        (get-or-assign-field-id! field-path))))

(defn- default-resolve-table
  "Default table resolver using file index."
  [table-path]
  (or (get-in @state [:table-path->id table-path])
      (when (get-in @state [:table-path->file table-path])
        (get-or-assign-table-id! table-path))))

(defn- default-resolve-database
  "Default database resolver using file index."
  [db-name]
  (or (get-in @state [:db-name->id db-name])
      (when (get-in @state [:db-name->file db-name])
        (get-or-assign-db-id! db-name))))

(defn- default-resolve-card
  "Default card resolver using file index."
  [entity-id]
  (or (get-in @state [:card-entity-id->id entity-id])
      (when (get-in @state [:card-entity-id->file entity-id])
        (get-or-assign-card-id! entity-id))))

(def default-resolvers
  "Default resolvers that use the file index."
  {:field    default-resolve-field
   :table    default-resolve-table
   :database default-resolve-database
   :card     default-resolve-card})

(def ^:dynamic *resolvers*
  "Map of resolver functions. Each resolver takes a path/name and returns an ID or nil.
   Keys: :field, :table, :database, :card
   Bind this to customize resolution behavior in tests."
  default-resolvers)

(defn- resolve-field-path
  "Resolve a field path to an ID. Returns ID if path exists, nil otherwise.
   Tracks unresolved references when *unresolved-refs* is bound."
  [field-path]
  (when field-path
    (or ((:field *resolvers*) field-path)
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :field :path field-path}))
            nil))))

(defn- resolve-table-path
  "Resolve a table path to an ID. Returns ID if path exists, nil otherwise."
  [table-path]
  (when table-path
    (or ((:table *resolvers*) table-path)
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :table :path table-path}))
            nil))))

(defn- resolve-db-name
  "Resolve a database name to an ID. Returns ID if db exists, nil otherwise."
  [db-name]
  (when db-name
    (or ((:database *resolvers*) db-name)
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :database :name db-name}))
            nil))))

(defn- resolve-card-entity-id
  "Resolve a card entity-id to an ID. Returns ID if card exists, nil otherwise."
  [entity-id]
  (when entity-id
    (or ((:card *resolvers*) entity-id)
        (do (when *unresolved-refs*
              (swap! *unresolved-refs* conj {:type :card :entity-id entity-id}))
            nil))))

;; Serdes import functions for query conversion
(defn- import-field-fk [path] (resolve-field-path path))
(defn- import-table-fk [path] (resolve-table-path path))
(defn- import-fk [entity-id model]
  (case model
    (Card Segment Measure) (resolve-card-entity-id entity-id)
    (do (when *unresolved-refs*
          (swap! *unresolved-refs* conj {:type :unknown :model model :entity-id entity-id}))
        nil)))
(defn- import-fk-keyed
  "Handle keyed lookups (e.g., Database by name). Returns nil to avoid DB queries."
  [portable model field]
  (case [model field]
    [:model/Database :name] (resolve-db-name portable)
    (do (when *unresolved-refs*
          (swap! *unresolved-refs* conj {:type :keyed-lookup :model model :field field :value portable}))
        nil)))

;;; ===========================================================================
;;; YAML to lib Metadata Conversion
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
    ;; Resolve FK target if present
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
      (binding [serdes/*import-field-fk* import-field-fk
                serdes/*import-table-fk* import-table-fk
                serdes/*import-fk* import-fk
                serdes/*import-fk-keyed* import-fk-keyed]
        (serdes/import-mbql query)))))

(defn- field-ref-has-nil?
  "Check if a converted field_ref contains nil (unresolved reference)."
  [ref]
  (and (vector? ref) (= :field (first ref)) (nil? (second ref))))

(defn- convert-result-metadata-column
  "Convert a result_metadata column, removing unresolved refs to pass validation."
  [col]
  (binding [serdes/*import-field-fk* import-field-fk
            serdes/*import-table-fk* import-table-fk
            serdes/*import-fk* import-fk
            serdes/*import-fk-keyed* import-fk-keyed]
    (cond-> col
      ;; Convert :id, remove if unresolved
      (vector? (:id col))
      (as-> c (if-let [id (import-field-fk (:id col))]
                (assoc c :id id) (dissoc c :id)))
      ;; Convert :table_id, remove if unresolved
      (vector? (:table_id col))
      (as-> c (if-let [id (import-table-fk (:table_id col))]
                (assoc c :table_id id) (dissoc c :table_id)))
      ;; Convert :fk_target_field_id, remove if unresolved
      (vector? (:fk_target_field_id col))
      (as-> c (if-let [id (import-field-fk (:fk_target_field_id col))]
                (assoc c :fk_target_field_id id) (dissoc c :fk_target_field_id)))
      ;; Convert :field_ref, remove if contains nil
      (:field_ref col)
      (as-> c (let [ref (serdes/import-mbql (:field_ref col))]
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
        ;; Resolve table_id
        table-id (when-let [t (:table_id yaml)]
                   (if (vector? t)
                     (binding [*unresolved-refs* unresolved] (resolve-table-path t))
                     t))
        ;; Resolve database from query
        db-name (get-in yaml [:dataset_query :database])
        db-id (when (string? db-name)
                (binding [*unresolved-refs* unresolved] (resolve-db-name db-name)))
        ;; Convert query and result metadata
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
;;; ===========================================================================

(deftype YamlMetadataProvider [export-dir]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (ensure-index! export-dir)
    (when-let [db-name (first (keys (:db-name->file @state)))]
      (when-let [yaml (ensure-database! db-name)]
        (yaml->database-metadata yaml))))

  (metadatas [_this {:keys [lib/type id table-id]}]
    (ensure-index! export-dir)
    (case type
      :metadata/table
      (if id
        (for [tid id
              :let [path (get-in @state [:id->table-path tid])]
              :when path
              :let [yaml (ensure-table! path)]
              :when yaml]
          (yaml->table-metadata yaml))
        (for [path (keys (:table-path->file @state))
              :let [yaml (ensure-table! path)]
              :when yaml]
          (yaml->table-metadata yaml)))

      :metadata/column
      (cond
        id (for [fid id
                 :let [path (get-in @state [:id->field-path fid])]
                 :when path
                 :let [yaml (ensure-field! path)]
                 :when yaml]
             (yaml->field-metadata yaml))
        table-id (let [tpath (get-in @state [:id->table-path table-id])
                       [db schema tbl] tpath]
                   (when tpath
                     (for [[fpath _] (:field-path->file @state)
                           ;; here's the linear scan mentioned in the todo on line 128
                           :when (and (= db (first fpath))
                                      (= schema (second fpath))
                                      (= tbl (nth fpath 2)))
                           :let [yaml (ensure-field! fpath)]
                           :when yaml]
                       (yaml->field-metadata yaml))))
        :else (for [path (keys (:field-path->file @state))
                    :let [yaml (ensure-field! path)]
                    :when yaml]
                (yaml->field-metadata yaml)))

      :metadata/card
      (if id
        (for [cid id
              :let [eid (get-in @state [:id->card-entity-id cid])]
              :when eid
              :let [yaml (ensure-card! eid)]
              :when yaml]
          (yaml->card-metadata yaml))
        (for [eid (keys (:card-entity-id->file @state))
              :let [yaml (ensure-card! eid)]
              :when yaml]
          (yaml->card-metadata yaml)))

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
  "Create a metadata provider for the export directory."
  [export-dir]
  (ensure-index! export-dir)
  (->YamlMetadataProvider export-dir))

;;; ===========================================================================
;;; Card Validation
;;; ===========================================================================

(defn- id->path
  "Convert an integer ID back to a human-readable path string."
  [id id-type]
  (case id-type
    :table (some->> (get-in @state [:id->table-path id]) (str/join "."))
    :field (some->> (get-in @state [:id->field-path id]) (str/join "."))
    :card (when-let [eid (get-in @state [:id->card-entity-id id])]
            (or (:name (get-in @state [:cards eid])) eid))
    :database (get-in @state [:id->db-name id])
    nil))

(declare extract-refs-from-card)

(defn- extract-refs-from-query
  "Extract table/field/card references from a query."
  ([query] (extract-refs-from-query query nil #{}))
  ([query provider visited]
   (let [table-ids (lib/all-source-table-ids query)
         card-ids (lib/all-source-card-ids query)
         cols (try (lib/returned-columns query) (catch Exception _ nil))
         ;; Direct refs
         tables (mapv #(id->path % :table) table-ids)
         fields (when cols (->> cols (keep :id) (mapv #(id->path % :field))))
         cards (mapv #(id->path % :card) card-ids)
         ;; Transitive refs from source cards
         transitive (when provider
                      (for [cid card-ids :when (not (visited cid))]
                        (extract-refs-from-card provider cid (conj visited cid))))
         all-tables (into (vec (remove nil? tables)) (mapcat :tables transitive))
         all-fields (into (vec (remove nil? fields)) (mapcat :fields transitive))
         all-cards (into (vec (remove nil? cards)) (mapcat :source-cards transitive))]
     {:tables (vec (distinct all-tables))
      :fields (vec (distinct all-fields))
      :source-cards (vec (distinct all-cards))})))

(defn- extract-refs-from-card [provider card-id visited]
  (try
    (when-let [card (lib.metadata/card provider card-id)]
      (when-let [dq (:dataset-query card)]
        (extract-refs-from-query (lib/query provider dq) provider visited)))
    (catch Exception _ {:tables [] :fields [] :source-cards []})))

(defn check-all-cards
  "Validate all cards in the export. Returns map of entity-id -> results."
  [export-dir]
  (let [provider (make-provider export-dir)]
    (into {}
          (for [entity-id (keys (:card-entity-id->file @state))
                :let [yaml (ensure-card! entity-id)
                      card-id (:id yaml)
                      card-meta (yaml->card-metadata yaml)]]
            [entity-id
             (if-let [missing-db (::unresolved-database card-meta)]
               {:card-id card-id
                :name (:name yaml)
                :entity-id entity-id
                :file (get-in @state [:card-entity-id->file entity-id])
                :unresolved (into [{:type :database :name missing-db}]
                                  (::unresolved-refs card-meta))
                :error (str "Unknown database: " missing-db)}
               (try
                 (let [card (lib.metadata/card provider card-id)
                       query (lib/query provider (:dataset-query card))
                       refs (extract-refs-from-query query provider #{card-id})
                       bad-refs (lib/find-bad-refs query)]
                   {:card-id card-id
                    :name (:name yaml)
                    :entity-id entity-id
                    :file (get-in @state [:card-entity-id->file entity-id])
                    :refs refs
                    :unresolved (::unresolved-refs card-meta)
                    :bad-refs bad-refs})
                 (catch Exception e
                   {:card-id card-id
                    :name (:name yaml)
                    :entity-id entity-id
                    :file (get-in @state [:card-entity-id->file entity-id])
                    :unresolved (::unresolved-refs card-meta)
                    :error (.getMessage e)})))]))))

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
                          (str "  Card ID: " (:card-id result))
                          (str "  File: " (:file result))])
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

;;; ===========================================================================
;;; Public API & Debugging
;;; ===========================================================================

(defn file-index-stats
  "Get statistics about the current file index."
  []
  (let [s @state]
    {:file-index-built? (:file-index-built? s)
     :export-dir (:export-dir s)
     :indexed {:databases (count (:db-name->file s))
               :tables (count (:table-path->file s))
               :fields (count (:field-path->file s))
               :cards (count (:card-entity-id->file s))}
     :loaded {:databases (count (:databases s))
              :tables (count (:tables s))
              :fields (count (:fields s))
              :cards (count (:cards s))}
     :database-names (vec (keys (:db-name->file s)))}))

(defn check
  "Validate all cards in export-dir. Resets state and rebuilds index first.
   Returns results map keyed by entity-id."
  [export-dir]
  (reset-state!)
  (check-all-cards export-dir))

(defn cli
  [{:keys [export output]}]
  (assert (string? export) "Export directory must be a string")
  (assert (string? output) "Output directory must be a string")
  (require 'clojure.pprint)
  (spit output
        (with-out-str (clojure.pprint/pprint (check-all-cards export)))))

(comment
  (write-results! (check "export-dir") "/tmp/realized.txt")
  (reset-state!)
  (file-index-stats)

  ;; Check all cards, get structured results
  (def results (check "export-dir"))
  (summarize-results results)
  (results-by-status results)

  ;; Write human-readable report
  (write-results! results "/tmp/ci-check-results.txt")

  ;; Filter to just errors/issues
  (filter (comp #{:error :issues} result-status second) results))
