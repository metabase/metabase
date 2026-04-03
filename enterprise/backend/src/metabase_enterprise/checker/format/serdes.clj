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

(defn extract-name [file-path]
  (quick-extract file-path "name" #"(?m)^name:\s*(.+)$"))

(defn extract-entity-id [file-path]
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

(defn- extract-serdes-meta
  "Extract the entity-level serdes/meta path from a YAML file.
   Returns a vector of {:id :model} maps, or nil if not found.
   Parses the full YAML and reads the :serdes/meta key."
  [^String file-path]
  (try
    (let [data (yaml/parse-string (slurp file-path))
          meta-entries (:serdes/meta data)]
      (when (seq meta-entries)
        (vec meta-entries)))
    (catch Exception _ nil)))

(def ^:private schema-model->kind
  "Map serdes/meta model names to index kinds for schema directory entities."
  {"Database" :database
   "Table"    :table
   "Field"    :field
   "Measure"  :measure
   "Segment"  :segment})

(defn- serdes-meta->index-entry
  "Convert a serdes/meta path to an index entry {:kind :ref :file}.
   The last model in the path determines the kind.
   The ref is built from the id values."
  [meta-path file-path]
  (let [last-entry (peek meta-path)
        kind       (get schema-model->kind (:model last-entry))]
    (when kind
      (case kind
        :database {:kind :database
                   :ref  (:id last-entry)
                   :file file-path}
        :table    (let [ids (mapv :id meta-path)]
                    {:kind :table
                     :ref  (case (count ids)
                             2 [(first ids) nil (second ids)]
                             3 [(first ids) (second ids) (nth ids 2)]
                             ids)
                     :file file-path})
        :field    (let [ids (mapv :id meta-path)]
                    {:kind :field
                     :ref  (case (count ids)
                             3 [(first ids) nil (second ids) (nth ids 2)]
                             4 [(first ids) (second ids) (nth ids 2) (nth ids 3)]
                             ids)
                     :file file-path})
        (:measure :segment)
        (when-let [entity-id (extract-entity-id file-path)]
          {:kind kind :ref entity-id :file file-path})))))

(defn- index-schema-dir
  "Walk a schema directory and build an index from serdes/meta in each YAML file.
   Does not assume any directory structure — reads metadata from file content.
   Also registers database names found in any entity's metadata path.
   Returns a vector of {:kind :ref :file} index entries."
  [schema-dir]
  (let [databases-seen (volatile! {})  ; db-name → first file-path
        entries (into []
                      (keep (fn [^java.io.File file]
                              (when (and (.isFile file)
                                         (str/ends-with? (.getName file) ".yaml"))
                                (let [path      (.getPath file)
                                      meta-path (extract-serdes-meta path)]
                                  (when meta-path
                                    ;; Track database names from metadata paths
                                    (when (and (>= (count meta-path) 1)
                                               (= "Database" (:model (first meta-path))))
                                      (let [db-name (:id (first meta-path))]
                                        (when-not (contains? @databases-seen db-name)
                                          (vswap! databases-seen assoc db-name path))))
                                    (serdes-meta->index-entry meta-path path))))))
                      (file-seq (io/file schema-dir)))]
    ;; Add database entries inferred from children, but only for databases
    ;; that don't already have their own YAML file in the primary entries
    (let [primary-dbs (into #{}
                            (keep (fn [{:keys [kind ref]}]
                                    (when (= kind :database) ref)))
                            entries)]
      (into entries
            (keep (fn [[db-name file-path]]
                    (when-not (contains? primary-dbs db-name)
                      {:kind :database :ref db-name :file file-path})))
            @databases-seen))))

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
   Returns a map with:
   - Entity kind keys (:database, :table, :field, :card, :dashboard, :collection)
     each mapping ref → file-path (first occurrence wins)
   - `:duplicates` — a vector of {:kind :ref :files [path1 path2 ...]} for any
     ref that appears in multiple files"
  [export-dir]
  (let [databases-dir (io/file export-dir "databases")
        entries (concat
                 (when (.isDirectory databases-dir)
                   (index-schema-dir databases-dir))
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
    (cond-> index
      (seq dupes) (assoc :duplicates dupes))))

(defn build-database-dir-index
  "Build index of database/table/field/measure/segment entities from a schema
   directory by reading serdes/meta from each YAML file. Does not assume any
   directory structure.

   Returns `{kind {ref file-path}}` with :database, :table, :field, :measure, :segment entries."
  [databases-dir]
  (let [entries (index-schema-dir databases-dir)]
    (reduce (fn [idx {:keys [kind ref file]}]
              (assoc-in idx [kind ref] file))
            {}
            entries)))

(defn index-stats
  "Get statistics about a file index."
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

(deftype SerdesSource [export-dir index]
  source/MetadataSource
  (resolve-database [_ db-name]
    (when-let [file (get-in index [:database db-name])]
      (load-yaml file)))

  (resolve-table [_ table-path]
    (when-let [file (get-in index [:table table-path])]
      (load-yaml file)))

  (resolve-field [_ field-path]
    (when-let [file (get-in index [:field field-path])]
      (load-yaml file)))

  (resolve-card [_ entity-id]
    (when-let [file (get-in index [:card entity-id])]
      (load-yaml file))))

(defn make-source
  "Create a MetadataSource for a serdes export directory."
  [export-dir]
  (->SerdesSource export-dir (build-file-index export-dir)))

(defn make-database-source
  "Create a MetadataSource for a directory that IS the databases directory.
   The directory should contain database subdirectories directly (e.g., `Sample Database/`).
   This source only resolves databases, tables, and fields — not cards."
  [databases-dir]
  (->SerdesSource databases-dir (build-database-dir-index databases-dir)))

(defn source-index
  "Get the file index from a SerdesSource."
  [^SerdesSource source]
  (.-index source))

(defn source-export-dir
  "Get the export directory from a SerdesSource."
  [^SerdesSource source]
  (.-export-dir source))

;;; ===========================================================================
;;; Enumeration
;;; ===========================================================================

(defn all-card-ids
  "Get all card entity-ids from source."
  [^SerdesSource source]
  (keys (:card (.-index source))))

(defn all-database-names
  "Get all database names from source."
  [^SerdesSource source]
  (keys (:database (.-index source))))

(defn all-table-paths
  "Get all table paths from source."
  [^SerdesSource source]
  (keys (:table (.-index source))))

(defn all-field-paths
  "Get all field paths from source."
  [^SerdesSource source]
  (keys (:field (.-index source))))
