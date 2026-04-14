(ns metabase-enterprise.checker.format.serdes
  "Serdes export format - directory structure, path parsing, entity loading.

   Directory structure:
     databases/<db-name>/<db-name>.yaml
     databases/<db-name>/schemas/<schema>/tables/<table>/<table>.yaml
     databases/<db-name>/schemas/<schema>/tables/<table>/fields/<field>.yaml
     databases/<db-name>/tables/<table>/<table>.yaml           # schema-less (SQLite)
     databases/<db-name>/tables/<table>/fields/<field>.yaml    # schema-less
     collections/<entity-id>_<slug>/<entity-id>_<slug>.yaml
     collections/.../cards/<entity-id>_<slug>.yaml
     collections/.../dashboards/<entity-id>_<slug>.yaml"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.checker.source :as source]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)))

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

(defn- table-dir
  "Resolve a table path [db schema table] to its directory on disk.
   Table directory names match the table name (not slugified)."
  ^File [^File databases-dir db-name->dir [db schema table]]
  (let [^File db (db-dir databases-dir db-name->dir db)]
    (if schema
      (io/file db "schemas" schema "tables" table)
      (io/file db "tables" table))))

(defn- list-table-paths
  "List table paths for a database by walking its directory structure.
   Returns a seq of [db-name schema table-name] refs."
  [^File databases-dir db-name->dir db-name]
  (let [^File db (db-dir databases-dir db-name->dir db-name)
        result   (volatile! [])]
    ;; With schema: <db>/schemas/<schema>/tables/<table>/
    (let [^File schemas-dir (io/file db "schemas")]
      (when (.isDirectory schemas-dir)
        (doseq [^File schema-dir (.listFiles schemas-dir)
                :when (.isDirectory schema-dir)]
          (let [schema-name (.getName schema-dir)
                ^File tables-dir (io/file schema-dir "tables")]
            (when (.isDirectory tables-dir)
              (doseq [^File td (.listFiles tables-dir)
                      :when (.isDirectory td)]
                (vswap! result conj [db-name schema-name (.getName td)])))))))
    ;; Without schema: <db>/tables/<table>/
    (let [^File tables-dir (io/file db "tables")]
      (when (.isDirectory tables-dir)
        (doseq [^File td (.listFiles tables-dir)
                :when (.isDirectory td)]
          (vswap! result conj [db-name nil (.getName td)]))))
    @result))

(defn- list-field-paths
  "List field paths for a table by reading its fields/ directory.
   Returns a set of [db schema table field-name] paths, skipping FieldValues/FieldUserSettings."
  [^File databases-dir db-name->dir [db schema table :as table-path]]
  (let [^File td         (table-dir databases-dir db-name->dir table-path)
        ^File fields-dir (io/file td "fields")]
    (when (.isDirectory fields-dir)
      (into #{}
            (keep (fn [^File f]
                    (let [fname (.getName f)]
                      (when (and (.isFile f)
                                 (str/ends-with? fname ".yaml")
                                 (not (str/includes? fname "___")))
                        [db schema table (str/replace fname #"\.yaml$" "")]))))
            (.listFiles fields-dir)))))

(deftype SerdesSource [databases-dir index db-name->dir]
  source/SchemaSource
  (resolve-database [_ db-name]
    (when-let [file (get-in index [:database db-name])]
      (load-yaml file)))

  (resolve-table [_ [_db _schema _table-name :as table-path]]
    (let [^File td   (table-dir databases-dir db-name->dir table-path)
          ^File yaml (io/file td (str (.getName td) ".yaml"))]
      (when (.exists yaml)
        (load-yaml (.getPath yaml)))))

  (resolve-field [_ [db schema table-name field :as _field-path]]
    (let [^File td   (table-dir databases-dir db-name->dir [db schema table-name])
          ^File yaml (io/file td "fields" (str field ".yaml"))]
      (when (.exists yaml)
        (load-yaml (.getPath yaml)))))

  (fields-for-table [_ table-path]
    (list-field-paths databases-dir db-name->dir table-path))

  (all-field-paths [this]
    (into #{}
          (mapcat #(source/fields-for-table this %))
          (source/all-table-paths this)))

  (all-database-names [_]
    (keys (:database index)))

  (all-table-paths [_]
    (into []
          (mapcat #(list-table-paths databases-dir db-name->dir %))
          (keys (:database index))))

  (tables-for-database [_ db-name]
    (list-table-paths databases-dir db-name->dir db-name))

  source/AssetsSource
  (resolve-card [_ entity-id]
    (when-let [file (get-in index [:card entity-id])]
      (load-yaml file)))

  (resolve-snippet [_ entity-id]
    (when-let [file (get-in index [:snippet entity-id])]
      (load-yaml file)))

  (resolve-transform [_ entity-id]
    (when-let [file (get-in index [:transform entity-id])]
      (load-yaml file)))

  (resolve-segment [_ entity-id]
    (when-let [file (get-in index [:segment entity-id])]
      (load-yaml file)))

  (resolve-dashboard [_ entity-id]
    (when-let [file (get-in index [:dashboard entity-id])]
      (load-yaml file)))

  (resolve-collection [_ entity-id]
    (when-let [file (get-in index [:collection entity-id])]
      (load-yaml file)))

  (resolve-document [_ entity-id]
    (when-let [file (get-in index [:document entity-id])]
      (load-yaml file)))

  (resolve-measure [_ entity-id]
    (when-let [file (get-in index [:measure entity-id])]
      (load-yaml file))))

(defn make-source
  "Create a MetadataSource for a serdes export directory.
   The databases-dir for field resolution is export-dir/databases."
  [export-dir]
  (let [databases-dir (io/file export-dir "databases")
        {:keys [index db-name->dir]} (build-file-index export-dir)]
    (->SerdesSource databases-dir index db-name->dir)))

(defn make-database-source
  "Create a MetadataSource for a directory that IS the databases directory.
   The directory should contain database subdirectories directly (e.g., `Sample Database/`).
   This source only resolves databases, tables, and fields — not cards."
  [databases-dir]
  (let [{:keys [index db-name->dir]} (build-database-dir-index databases-dir)]
    (->SerdesSource (io/file databases-dir) index db-name->dir)))

(defn source-index
  "Get the file index from a SerdesSource."
  [^SerdesSource source]
  (.-index source))

;;; ===========================================================================
;;; Enumeration
;;; ===========================================================================

(defn all-card-ids
  "Get all card entity-ids from source."
  [^SerdesSource source]
  (keys (:card (.-index source))))
