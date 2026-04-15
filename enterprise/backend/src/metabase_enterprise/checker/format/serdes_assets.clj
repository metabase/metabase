(ns metabase-enterprise.checker.format.serdes-assets
  "Serdes export format — directory structure, path parsing, entity loading.

   Directory structure (on disk, names may be slugified):
     databases/<db-dir>/<db-dir>.yaml
     databases/<db-dir>/schemas/<schema-dir>/tables/<table-dir>/<table-dir>.yaml
     databases/<db-dir>/schemas/<schema-dir>/tables/<table-dir>/fields/<field>.yaml
     databases/<db-dir>/tables/<table-dir>/<table-dir>.yaml           # schema-less
     databases/<db-dir>/tables/<table-dir>/fields/<field>.yaml        # schema-less
     collections/<entity-id>_<slug>/<entity-id>_<slug>.yaml
     collections/.../cards/<entity-id>_<slug>.yaml
     collections/.../dashboards/<entity-id>_<slug>.yaml

   Directory names may differ from entity names (e.g. `analytics_data_warehouse`
   for \"Analytics Data Warehouse\", or `orders` for \"ORDERS\" in H2).

   ## Lazy resolution cache

   The `SerdesSource` maintains a single lazily-populated cache atom that maps
   real entity names (from YAML) to file locations:

     {db-name                                     ; real name, e.g. \"Analytics Data Warehouse\"
       {schema                                    ; real name or nil for schema-less
         ::not-indexed                            ; schema exists but tables not yet walked
         | {table-name                            ; real name from YAML
              {:table-file \"path/to/table.yaml\" ; path string to the table YAML
               :fields ::not-indexed              ; fields not yet walked for this table
                     | {field-name \"path\" ...}}}}} ; real name → field YAML path

   Two levels of laziness:
   1. Schema → tables: realized when any table in that schema is resolved
      (via `resolve-table`, `resolve-field`, `fields-for-table`) or when
      `tables-for-database` is called. Walks the schema's `tables/` directory
      and reads each table's `name:` from YAML via fast regex.
   2. Table → fields: realized when `resolve-field` or `fields-for-table` is
      called for that specific table. Walks the table's `fields/` directory
      and reads each field's `name:` via fast regex. Other tables in the same
      schema are unaffected.

   The `db-name->dir` map (built at startup from ~40 database YAMLs) handles the
   database name → directory name translation. Schema and table name → directory
   name translation is handled by case-insensitive directory matching during
   schema indexing."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.source :as source]
   [metabase.util.yaml :as yaml]
   [potemkin.types :as p.types])
  (:import
   (java.io File)
   (java.util Locale)))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; YAML Loading
;;; ===========================================================================

(defn load-yaml
  "Load and parse a YAML file."
  [path]
  (yaml/parse-string (slurp path)))

(defn quick-extract
  "Extract a field from YAML using regex (fast) with full parse fallback."
  [file-path field-name pattern]
  (try
    (let [content (slurp file-path)]
      (if-let [[_ value] (re-find pattern content)]
        (str/trim value)
        (get (yaml/parse-string content) (keyword field-name))))
    (catch Exception _ nil)))

(defn extract-entity-id
  "Extract the entity id from a yaml file without parsing it. Looking for a top level entity_id at start of line."
  [file-path]
  (quick-extract file-path "entity_id" #"(?m)^entity_id:\s*(\S+)"))

(defn extract-model
  "Extract the serdes model from a YAML file (e.g., \"Collection\", \"Card\", \"Dashboard\").
   Looks for the model field inside serdes/meta to avoid matching embedded refs."
  [file-path]
  (try
    (let [content (slurp file-path)]
      (when-let [[_ model] (re-find #"(?m)^serdes/meta:\s*\n\s*- id:.*\n\s+(?:label:.*\n\s+)?model:\s*(\S+)" content)]
        (str/trim model)))
    (catch Exception _ nil)))

(defn- read-yaml-name
  "Read the `name:` field from a YAML file using regex (fast).
   Falls back to `fallback` if the file doesn't exist or can't be read."
  [^File yaml-file ^String fallback]
  (if (.exists yaml-file)
    (or (quick-extract (.getPath yaml-file) "name" #"(?m)^name:\s*(.+)")
        fallback)
    fallback))

(defn- db-dir
  "Resolve a real database name to its directory on disk."
  ^File [^File databases-dir db-name->dir db-name]
  (let [dir-name (get db-name->dir db-name db-name)]
    (io/file databases-dir dir-name)))

(defn- list-table-dirs
  "Return a seq of table directory Files for a database.
   Walks schemas/<schema>/tables/<table>/ and tables/<table>/ directories."
  [^File databases-dir db-name->dir-map db-name]
  (let [^File db (db-dir databases-dir db-name->dir-map db-name)
        result   (volatile! [])]
    (let [^File schemas-dir (io/file db "schemas")]
      (when (.isDirectory schemas-dir)
        (doseq [^File schema-d (.listFiles schemas-dir)
                :when (.isDirectory schema-d)]
          (let [^File tables-dir (io/file schema-d "tables")]
            (when (.isDirectory tables-dir)
              (doseq [^File td (.listFiles tables-dir)
                      :when (.isDirectory td)]
                (vswap! result conj td)))))))
    (let [^File tables-dir (io/file db "tables")]
      (when (.isDirectory tables-dir)
        (doseq [^File td (.listFiles tables-dir)
                :when (.isDirectory td)]
          (vswap! result conj td))))
    @result))

(defn- index-segments-and-measures
  "Walk a table directory's segments/ and measures/ subdirectories.
   Reads entity_id from each YAML (only a handful exist).
   Returns a seq of {:kind :ref :file} entries."
  [^File table-dir]
  (into []
        (mapcat
         (fn [[subdir kind]]
           (let [^File d (io/file table-dir subdir)]
             (when (.isDirectory d)
               (keep (fn [^File f]
                       (when (and (.isFile f) (str/ends-with? (.getName f) ".yaml"))
                         (when-let [eid (extract-entity-id (.getPath f))]
                           {:kind kind :ref eid :file (.getPath f)})))
                     (.listFiles d))))))
        [["segments" :segment] ["measures" :measure]]))

(defn- index-schema-dir
  "Walk a databases directory and index databases, segments, and measures.
   Reads ~40 database YAMLs for real names, plus a handful of segment/measure YAMLs
   for entity_ids. Tables and fields are resolved on demand from the filesystem.

   When `include-segments-measures?` is true, also walks table directories
   to find segment and measure YAMLs (for export dirs). Set to false for
   schema-only dirs to avoid walking thousands of table directories.

   Returns {:entries [...]
            :db-name->dir {real-db-name dir-name}}."
  [schema-dir & {:keys [include-segments-measures?]}]
  (let [schema-dir   (io/file schema-dir)
        db-name->dir (volatile! {})
        entries      (volatile! [])]
    (doseq [^File db-dir (.listFiles schema-dir)
            :when (.isDirectory db-dir)]
      (let [dir-name (.getName db-dir)
            db-yaml  (io/file db-dir (str dir-name ".yaml"))
            db-name  (read-yaml-name db-yaml dir-name)]
        (vswap! db-name->dir assoc db-name dir-name)
        (vswap! entries conj {:kind :database :ref db-name
                              :file (if (.exists db-yaml) (.getPath db-yaml) (.getPath db-dir))})
        ;; Walk table directories for segments and measures (export dirs only)
        (when include-segments-measures?
          (doseq [^File table-dir (list-table-dirs schema-dir @db-name->dir db-name)]
            (vswap! entries into (index-segments-and-measures table-dir))))))
    {:entries      @entries
     :db-name->dir @db-name->dir}))

;;; ===========================================================================
;;; File Walking - Build index of all entities
;;; ===========================================================================

(def ^:private model->kind
  "Map serdes model names to index kinds."
  {"Card"               :card
   "Dashboard"          :dashboard
   "Collection"         :collection
   "Document"           :document
   "Measure"            :measure
   "Segment"            :segment
   "NativeQuerySnippet" :snippet
   "Transform"          :transform})

(defn- index-collections-tree
  "Walk the collections/ directory and index all entities by their serdes model.
   Returns entries for cards, dashboards, and collections."
  [export-dir]
  (let [collections-dir (io/file export-dir "collections")]
    (when (.isDirectory collections-dir)
      (for [^File file (file-seq collections-dir)
            :when (.isFile file)
            :let  [path (.getPath file)]
            :when (str/ends-with? (.getName file) ".yaml")
            :let  [model (extract-model path)
                   kind  (get model->kind model)]
            :when kind
            :let  [entity-id (extract-entity-id path)]
            :when entity-id]
        {:kind kind :ref entity-id :file path}))))

(defn build-file-index
  "Build index of all entity files in an export directory.
   Returns `{:index {kind {ref file-path}} :db-name->dir {real-name dir-name}}`
   where index also has `:duplicates` for refs appearing in multiple files."
  [export-dir]
  (let [databases-dir (io/file export-dir "databases")
        schema-result (when (.isDirectory databases-dir)
                        (index-schema-dir databases-dir :include-segments-measures? true))
        entries       (concat
                       (:entries schema-result)
                       (index-collections-tree export-dir))
        ;; Group by [kind ref] to find duplicates
        by-key  (reduce (fn [m {:keys [kind ref file]}]
                          (update m [kind ref] (fnil conj []) file))
                        {}
                        entries)
        ;; Build the index (first file wins) and collect duplicates
        index   (reduce-kv (fn [idx [kind ref] files]
                             (assoc-in idx [kind ref] (first files)))
                           {}
                           by-key)
        dupes   (into []
                      (keep (fn [[[kind ref] files]]
                              (when (> (count files) 1)
                                {:kind kind :ref ref :files files})))
                      by-key)]
    {:index        (cond-> index
                     (seq dupes) (assoc :duplicates dupes))
     :db-name->dir (:db-name->dir schema-result)}))

(defn build-database-dir-index
  "Build index of databases from a schema directory.
   Tables and fields are resolved on demand.

   Returns `{:index {:database {name file-path}} :db-name->dir {real-name dir-name}}`."
  [databases-dir]
  (let [{:keys [entries db-name->dir]} (index-schema-dir databases-dir)]
    {:index        (reduce (fn [idx {:keys [kind ref file]}]
                             (assoc-in idx [kind ref] file))
                           {}
                           entries)
     :db-name->dir db-name->dir}))

(defn index-stats
  "Get statistics about a file index.
   Note: tables and fields are resolved on demand and won't appear in the index
   for schema-dir sources. They will be 0 for `build-database-dir-index` results."
  [index]
  {:databases      (count (:database index))
   :tables         (count (:table index))
   :fields         (count (:field index))
   :measures       (count (:measure index))
   :segments       (count (:segment index))
   :cards          (count (:card index))
   :dashboards     (count (:dashboard index))
   :collections    (count (:collection index))
   :database-names (vec (keys (:database index)))})

;;; ===========================================================================
;;; MetadataSource Implementation
;;;
;;; Returns raw YAML data - the checker handles conversion to lib format.
;;; This keeps format knowledge here, lib knowledge in checker.
;;; ===========================================================================

(defn- table-real-name
  "Read the real table name from its YAML file via regex. Falls back to dir name."
  [^File table-dir]
  (let [dir-name (.getName table-dir)
        ^File yaml (io/file table-dir (str dir-name ".yaml"))]
    (read-yaml-name yaml dir-name)))

(defn- field-real-name
  "Read the real field name from its YAML file via regex. Falls back to filename without extension."
  [^File field-yaml]
  (let [fname (.getName field-yaml)
        fallback (str/replace fname #"\.yaml$" "")]
    (read-yaml-name field-yaml fallback)))

(defn- read-yaml-schema
  "Read the `schema:` field from a YAML file using regex (fast).
   Returns nil if not found or if the value is `null`."
  [^File yaml-file]
  (when (.exists yaml-file)
    (let [v (quick-extract (.getPath yaml-file) "schema" #"(?m)^schema:\s*(\S+)")]
      (when (and v (not= v "null"))
        v))))

(defn- index-schema-tables
  "Walk a single schema's tables directory and return:
   {:real-schema-name string-or-nil  ; the real schema name from YAML (may differ from dir name)
    :tables {real-table-name {:table-file \"path\", :fields ::not-indexed} ...}}
   Reads real table names from YAMLs via fast regex.
   Fields are NOT indexed here — they are indexed lazily per-table."
  [^File tables-dir]
  (when (.isDirectory tables-dir)
    (let [real-schema (volatile! nil)
          tables (into {}
                       (keep (fn [^File td]
                               (when (.isDirectory td)
                                 (let [table-name (table-real-name td)
                                       dir-name   (.getName td)
                                       ^File yaml (io/file td (str dir-name ".yaml"))]
                                   (when (.exists yaml)
                                     (when-not @real-schema
                                       (vreset! real-schema (read-yaml-schema yaml)))
                                     [table-name {:table-file (.getPath yaml) :fields ::not-indexed}])))))
                       (.listFiles tables-dir))]
      {:real-schema-name @real-schema
       :tables           tables})))

(defn- index-table-fields
  "Walk a table's fields/ directory and return a map of:
   {real-field-name File ...}
   Reads real field names from YAMLs via fast regex.
   Skips FieldValues and FieldUserSettings files."
  [table-file-path]
  (let [^File table-dir (.getParentFile (io/file table-file-path))
        ^File fields-dir (io/file table-dir "fields")]
    (if (.isDirectory fields-dir)
      (into {}
            (keep (fn [^File f]
                    (let [fname (.getName f)]
                      (when (and (.isFile f)
                                 (str/ends-with? fname ".yaml")
                                 (not (str/includes? fname "___")))
                        [(field-real-name f) (.getPath f)]))))
            (.listFiles fields-dir))
      {})))

(defn- resolve-schema-name
  "Resolve a real schema name to the key used in the model.

   Schema names are the one entity type with no canonical YAML file — the directory
   name is the filesystem key, and the real name comes from the `schema:` field in
   table YAMLs. These may differ (e.g. dir=`public`, real=`PUBLIC` for H2).

   Strategy:
   1. Exact match in the model's :schemas
   2. Case-insensitive match (handles H2-style uppercasing)
   3. nil for schema-less databases

   To change schema resolution in the future, modify this function."
  [model db-name schema]
  (let [schemas (:schemas (get model db-name))
        lower (fn [s] (.toLowerCase (str s) Locale/US))]
    (cond
      (contains? schemas schema) schema
      schema (let [lowered (lower schema)]
               (some (fn [k] (when (and (string? k) (= (lower k) lowered)) k))
                     (keys schemas)))
      :else (when (contains? schemas nil) nil))))

(defn- ensure-schema-indexed!
  "Ensure a schema's tables are indexed in the model. No-op if already done.

   Resolves the requested schema name to a model key (possibly case-insensitive),
   walks the table directories, reads real names from YAMLs, and stores the results.
   If the real schema name (from the table YAML `schema:` field) differs from the
   directory name, the model entry is re-keyed under the real name."
  [^File databases-dir db-name->dir db-name schema model]
  (let [model-key (resolve-schema-name @model db-name schema)]
    (when (= ::not-indexed (get-in @model [db-name :schemas model-key]))
      (let [^File db (db-dir databases-dir db-name->dir db-name)
            ^File tables-dir (if model-key
                               (io/file db "schemas" model-key "tables")
                               (io/file db "tables"))
            {:keys [real-schema-name tables]} (index-schema-tables tables-dir)
            tables       (or tables {})
            ;; The real schema name (from YAML) is the canonical key.
            ;; Falls back to model-key (dir name) or the requested name.
            final-key    (or real-schema-name model-key schema)]
        (swap! model (fn [m]
                       (cond-> m
                         ;; Remove old key if re-keying
                         (and model-key (not= model-key final-key))
                         (update-in [db-name :schemas] dissoc model-key)
                         ;; Store under canonical name
                         true
                         (assoc-in [db-name :schemas final-key] tables))))))))

(defn- ensure-fields-indexed!
  "Ensure a table's fields are indexed in the model. No-op if already done."
  [^File databases-dir db-name->dir db-name schema table-name model]
  (ensure-schema-indexed! databases-dir db-name->dir db-name schema model)
  (when (= ::not-indexed (get-in @model [db-name :schemas schema table-name :fields]))
    (when-let [table-file (get-in @model [db-name :schemas schema table-name :table-file])]
      (let [field-map (index-table-fields table-file)]
        (swap! model assoc-in [db-name :schemas schema table-name :fields] field-map)))))

(defn- list-schemas
  "List schema directory names for a database. Returns seq of strings, or [nil] for schema-less."
  [^File databases-dir db-name->dir db-name]
  (let [^File db (db-dir databases-dir db-name->dir db-name)
        ^File schemas-dir (io/file db "schemas")
        ^File tables-dir (io/file db "tables")]
    (cond-> []
      (.isDirectory schemas-dir)
      (into (map #(.getName ^File %))
            (filter #(.isDirectory ^File %) (.listFiles schemas-dir)))
      (.isDirectory tables-dir)
      (conj nil))))

(defn- init-schema-model
  "Build the initial schema model with db-file paths and ::not-indexed for each schema.

   Schema model shape:
     {db-name {:db-file \"path/to/db.yaml\"
               :schemas {schema ::not-indexed
                                | {table {:table-file \"path\" :fields ::not-indexed | {field \"path\"}}}}}}

   Two levels of laziness:
   1. Schema → tables: populated when the schema is first accessed
   2. Table → fields: populated when that table's fields are first accessed"
  [^File databases-dir db-name->dir db-file-index]
  (atom
   (into {}
         (for [[db-name _dir-name] db-name->dir]
           [db-name {:db-file (get db-file-index db-name)
                     :schemas (into {}
                                    (for [schema (list-schemas databases-dir db-name->dir db-name)]
                                      [schema ::not-indexed]))}]))))

(p.types/defprotocol+ ISchemaModelDebug
  "Non exported protocol to get the schema of the SerdesSource. Useful for debugging and asserting on the schema model
  built up during serdes."
  (schema-model [_] "Deref and return the schema model. See [[init-schema-model]] for details of this structure."))

(deftype SerdesSource [databases-dir assets-index db-name->dir
                       ;; See init-schema-model for shape documentation
                       schema-model]
  source/SchemaSource
  (resolve-database [_ db-name]
    (when-let [file (get-in @schema-model [db-name :db-file])]
      (load-yaml file)))

  (resolve-table [_ [db schema table-name :as _table-path]]
    (ensure-schema-indexed! databases-dir db-name->dir db schema schema-model)
    (when-let [path (get-in @schema-model [db :schemas schema table-name :table-file])]
      (load-yaml path)))

  (resolve-field [_ [db schema table-name field :as _field-path]]
    (ensure-fields-indexed! databases-dir db-name->dir db schema table-name schema-model)
    (when-let [path (get-in @schema-model [db :schemas schema table-name :fields field])]
      (load-yaml path)))

  (fields-for-table [_ [db schema table-name :as _table-path]]
    (ensure-fields-indexed! databases-dir db-name->dir db schema table-name schema-model)
    (when-let [entry (get-in @schema-model [db :schemas schema table-name])]
      (let [fields (:fields entry)]
        (when (map? fields)
          (into #{} (map (fn [field-name] [db schema table-name field-name])) (keys fields))))))

  (all-field-paths [_]
    (doseq [[db-name {:keys [schemas]}] @schema-model
            [schema tables] schemas
            :when (= tables ::not-indexed)]
      (ensure-schema-indexed! databases-dir db-name->dir db-name schema schema-model))
    (doseq [[db-name {:keys [schemas]}] @schema-model
            [schema tables] schemas
            :when (map? tables)
            [table-name entry] tables
            :when (= (:fields entry) ::not-indexed)]
      (ensure-fields-indexed! databases-dir db-name->dir db-name schema table-name schema-model))
    (into #{}
          (for [[db {:keys [schemas]}] @schema-model
                [schema tables] schemas
                :when (map? tables)
                [table-name {:keys [fields]}] tables
                :when (map? fields)
                field-name (keys fields)]
            [db schema table-name field-name])))

  (all-database-names [_]
    (keys @schema-model))

  (all-table-paths [_]
    (doseq [[db-name {:keys [schemas]}] @schema-model
            [schema _] schemas]
      (ensure-schema-indexed! databases-dir db-name->dir db-name schema schema-model))
    (into []
          (for [[db {:keys [schemas]}] @schema-model
                [schema tables] schemas
                :when (map? tables)
                table-name (keys tables)]
            [db schema table-name])))

  (tables-for-database [_ db-name]
    (doseq [[schema _] (:schemas (get @schema-model db-name))]
      (ensure-schema-indexed! databases-dir db-name->dir db-name schema schema-model))
    (into []
          (for [[schema tables] (:schemas (get @schema-model db-name))
                :when (map? tables)
                table-name (keys tables)]
            [db-name schema table-name])))

  source/AssetsSource
  (resolve-card [_ entity-id]
    (when-let [file (get-in assets-index [:card entity-id])]
      (load-yaml file)))

  (resolve-snippet [_ entity-id]
    (when-let [file (get-in assets-index [:snippet entity-id])]
      (load-yaml file)))

  (resolve-transform [_ entity-id]
    (when-let [file (get-in assets-index [:transform entity-id])]
      (load-yaml file)))

  (resolve-segment [_ entity-id]
    (when-let [file (get-in assets-index [:segment entity-id])]
      (load-yaml file)))

  (resolve-dashboard [_ entity-id]
    (when-let [file (get-in assets-index [:dashboard entity-id])]
      (load-yaml file)))

  (resolve-collection [_ entity-id]
    (when-let [file (get-in assets-index [:collection entity-id])]
      (load-yaml file)))

  (resolve-document [_ entity-id]
    (when-let [file (get-in assets-index [:document entity-id])]
      (load-yaml file)))

  (resolve-measure [_ entity-id]
    (when-let [file (get-in assets-index [:measure entity-id])]
      (load-yaml file)))
  ISchemaModelDebug
  (schema-model [_] (deref schema-model)))

(defn make-source
  "Create a MetadataSource for a serdes export directory.
   The databases-dir for field resolution is export-dir/databases."
  [export-dir]
  (let [databases-dir (io/file export-dir "databases")
        {:keys [index db-name->dir]} (build-file-index export-dir)
        db-files      (:database index)
        assets-index  (dissoc index :database)]
    (->SerdesSource databases-dir assets-index db-name->dir
                    (init-schema-model databases-dir db-name->dir db-files))))

(defn make-database-source
  "Create a MetadataSource for a directory that IS the databases directory.
   The directory should contain database subdirectories directly (e.g., `Sample Database/`).
   This source only resolves databases, tables, and fields — not cards."
  [databases-dir]
  (let [{:keys [index db-name->dir]} (build-database-dir-index databases-dir)
        databases-dir (io/file databases-dir)
        db-files      (:database index)]
    (->SerdesSource databases-dir {} db-name->dir
                    (init-schema-model databases-dir db-name->dir db-files))))

(defn source-index
  "Get the assets index from a SerdesSource. Returns a flat map of
   {[kind ref] file-path} for cards, dashboards, segments, etc."
  [^SerdesSource source]
  (.-assets-index source))

;;; ===========================================================================
;;; Enumeration
;;; ===========================================================================

(defn all-card-ids
  "Get all card entity-ids from source."
  [^SerdesSource source]
  (keys (:card (.-assets-index source))))
