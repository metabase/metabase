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
;;; Path Parsing - Infer entity type from file path
;;; ===========================================================================

(defn infer-entity-type
  "Infer entity type from file path. Returns keyword or nil."
  [^String path]
  (cond
    (re-find #"/databases/[^/]+/[^/]+\.yaml$" path) :database
    (re-find #"/tables/[^/]+/[^/]+\.yaml$" path) :table
    (re-find #"/fields/[^/]+\.yaml$" path) :field
    (re-find #"/cards/[^/]+\.yaml$" path) :card
    (re-find #"/dashboards/[^/]+\.yaml$" path) :dashboard
    (re-find #"/collections/[^/]+/[^/]+\.yaml$" path) :collection
    :else nil))

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

;;; ===========================================================================
;;; File Walking - Build index of all entities
;;; ===========================================================================

(defn walk-yaml-files
  "Walk export directory and call (f file-path entity-type) for each YAML file.
   Returns nil, used for side effects."
  [export-dir f]
  (doseq [^File file (file-seq (io/file export-dir))
          :when (.isFile file)
          :when (str/ends-with? (.getName file) ".yaml")
          :let [path (.getPath file)
                entity-type (infer-entity-type path)]
          :when entity-type]
    (f path entity-type)))

(defn build-file-index
  "Build index of all entity files in export directory.
   Returns map with :databases, :tables, :fields, :cards, :dashboards, :collections.
   Each is a map from identifying path/id to file path."
  [export-dir]
  (let [index (atom {:db-name->file {}
                     :table-path->file {}
                     :field-path->file {}
                     :card-entity-id->file {}
                     :dashboard-entity-id->file {}
                     :collection-entity-id->file {}})]
    ;; Index databases, tables, fields via directory structure
    (let [db-dir (io/file export-dir "databases")]
      (when (.exists db-dir)
        (doseq [^File db-folder (.listFiles db-dir)
                :when (.isDirectory db-folder)
                :let [folder-name (.getName db-folder)
                      db-yaml-file (io/file db-folder (str folder-name ".yaml"))]
                :when (.exists db-yaml-file)
                :let [db-name folder-name]]
          ;; Index database
          (swap! index assoc-in [:db-name->file db-name] (.getPath db-yaml-file))
          ;; Index tables and fields - two possible structures
          (let [schemas-dir (io/file db-folder "schemas")
                tables-dir-no-schema (io/file db-folder "tables")]
            ;; With schemas: databases/<db>/schemas/<schema>/tables/<table>/
            (when (.exists schemas-dir)
              (doseq [^File schema-dir (.listFiles schemas-dir)
                      :when (.isDirectory schema-dir)
                      :let [schema-name (.getName schema-dir)
                            tables-dir (io/file schema-dir "tables")]
                      :when (.exists tables-dir)
                      ^File table-dir (.listFiles tables-dir)
                      :when (.isDirectory table-dir)
                      :let [table-name (.getName table-dir)
                            table-path [db-name schema-name table-name]
                            table-yaml (io/file table-dir (str table-name ".yaml"))]]
                (when (.exists table-yaml)
                  (swap! index assoc-in [:table-path->file table-path] (.getPath table-yaml)))
                (let [fields-dir (io/file table-dir "fields")]
                  (when (.exists fields-dir)
                    (doseq [^File field-file (.listFiles fields-dir)
                            :when (.isFile field-file)
                            :when (str/ends-with? (.getName field-file) ".yaml")
                            :when (not (str/includes? (.getName field-file) "___"))
                            :let [field-name (str/replace (.getName field-file) ".yaml" "")
                                  field-path [db-name schema-name table-name field-name]]]
                      (swap! index assoc-in [:field-path->file field-path] (.getPath field-file)))))))
            ;; Without schemas: databases/<db>/tables/<table>/
            (when (.exists tables-dir-no-schema)
              (doseq [^File table-dir (.listFiles tables-dir-no-schema)
                      :when (.isDirectory table-dir)
                      :let [table-name (.getName table-dir)
                            table-path [db-name nil table-name]
                            table-yaml (io/file table-dir (str table-name ".yaml"))]]
                (when (.exists table-yaml)
                  (swap! index assoc-in [:table-path->file table-path] (.getPath table-yaml)))
                (let [fields-dir (io/file table-dir "fields")]
                  (when (.exists fields-dir)
                    (doseq [^File field-file (.listFiles fields-dir)
                            :when (.isFile field-file)
                            :when (str/ends-with? (.getName field-file) ".yaml")
                            :when (not (str/includes? (.getName field-file) "___"))
                            :let [field-name (str/replace (.getName field-file) ".yaml" "")
                                  field-path [db-name nil table-name field-name]]]
                      (swap! index assoc-in [:field-path->file field-path] (.getPath field-file)))))))))))
    ;; Index cards (entity_id based)
    (doseq [^File file (file-seq (io/file export-dir))
            :when (.isFile file)
            :when (re-matches #".*/cards/[^/]+\.yaml$" (.getPath file))
            :let [entity-id (extract-entity-id (.getPath file))]
            :when entity-id]
      (swap! index assoc-in [:card-entity-id->file entity-id] (.getPath file)))
    ;; Index dashboards
    (doseq [^File file (file-seq (io/file export-dir))
            :when (.isFile file)
            :when (re-matches #".*/dashboards/[^/]+\.yaml$" (.getPath file))
            :let [entity-id (extract-entity-id (.getPath file))]
            :when entity-id]
      (swap! index assoc-in [:dashboard-entity-id->file entity-id] (.getPath file)))
    @index))

(defn index-stats
  "Get statistics about a file index."
  [index]
  {:databases (count (:db-name->file index))
   :tables (count (:table-path->file index))
   :fields (count (:field-path->file index))
   :cards (count (:card-entity-id->file index))
   :dashboards (count (:dashboard-entity-id->file index))
   :database-names (vec (keys (:db-name->file index)))})

;;; ===========================================================================
;;; MetadataSource Implementation
;;;
;;; Returns raw YAML data - the checker handles conversion to lib format.
;;; This keeps format knowledge here, lib knowledge in checker.
;;; ===========================================================================

(deftype SerdesSource [export-dir index]
  source/MetadataSource
  (resolve-database [_ db-name]
    (when-let [file (get (:db-name->file index) db-name)]
      (load-yaml file)))

  (resolve-table [_ table-path]
    (when-let [file (get (:table-path->file index) table-path)]
      (load-yaml file)))

  (resolve-field [_ field-path]
    (when-let [file (get (:field-path->file index) field-path)]
      (load-yaml file)))

  (resolve-card [_ entity-id]
    (when-let [file (get (:card-entity-id->file index) entity-id)]
      (load-yaml file))))

(defn make-source
  "Create a MetadataSource for a serdes export directory."
  [export-dir]
  (->SerdesSource export-dir (build-file-index export-dir)))

(defn source-index
  "Get the file index from a SerdesSource."
  [^SerdesSource source]
  (.-index source))

(defn source-export-dir
  "Get the export directory from a SerdesSource."
  [^SerdesSource source]
  (.-export-dir source))

;;; ===========================================================================
;;; Enumeration (serdes-specific)
;;;
;;; These functions know how to list entities from the file index.
;;; Not part of the MetadataSource protocol - enumeration is format-specific.
;;; ===========================================================================

(defn all-card-ids
  "Get all card entity-ids from source."
  [^SerdesSource source]
  (keys (:card-entity-id->file (.-index source))))

(defn all-database-names
  "Get all database names from source."
  [^SerdesSource source]
  (keys (:db-name->file (.-index source))))

(defn all-table-paths
  "Get all table paths from source."
  [^SerdesSource source]
  (keys (:table-path->file (.-index source))))

(defn all-field-paths
  "Get all field paths from source."
  [^SerdesSource source]
  (keys (:field-path->file (.-index source))))

(defn make-enumerators
  "Create enumerators map for use with checker/check-cards."
  [source]
  {:databases #(all-database-names source)
   :tables    #(all-table-paths source)
   :fields    #(all-field-paths source)
   :cards     #(all-card-ids source)})

;;; ===========================================================================
;;; High-level API
;;; ===========================================================================

(defn check
  "Check all cards in a serdes export directory.
   Returns map of entity-id -> result."
  [^SerdesSource source]
  (let [checker (requiring-resolve 'metabase-enterprise.checker.checker/check-cards)]
    (checker source (make-enumerators source) (all-card-ids source))))

(defn check-cards
  "Check specific cards in a serdes export.
   Returns map of entity-id -> result."
  [^SerdesSource source card-ids]
  (let [checker (requiring-resolve 'metabase-enterprise.checker.checker/check-cards)]
    (checker source (make-enumerators source) card-ids)))
