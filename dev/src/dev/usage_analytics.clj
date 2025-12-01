(ns dev.usage-analytics
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.env :as mdb.env]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(def ^:private canonical-db-id
  "The serdes ID used in YAMLs for the audit database."
  "Internal Metabase Database")

(def ^:private canonical-creator-id
  "The creator email used in YAMLs for all analytics content."
  "internal@metabase.com")

(def ^:private dev-db-name "Analytics Development DB")

;;; ============================================================================
;;; Database Management
;;; ============================================================================

(defn- get-app-db-type
  "Get the type of the application database."
  []
  (mdb/db-type))

(defn- get-app-db-connection-details
  "Get the application database connection details including password.

  Returns a map suitable for creating a Metabase Database entry.
  Uses the same connection details as the app DB (from environment variables)."
  []
  (let [db-type (get-app-db-type)]
    (@#'mdb.env/broken-out-details db-type mdb.env/env)))

(defn find-analytics-dev-database
  "Finds existing analytics dev database."
  []
  (t2/select-one :model/Database :name dev-db-name))

(defn create-analytics-dev-database!
  "Creates a Database entry pointing to the app database for analytics development.

  The database:
  - Points to the same database as the app DB
  - Named 'Analytics Development DB'
  - Not marked as is_audit (gets normal permissions, is editable)

  Returns the created database map."
  [user-id]
  (let [db-type (get-app-db-type)]
    (if-let [existing (find-analytics-dev-database)]
      (do
        (log/info "Analytics dev database already exists:" (:id existing))
        existing)
      (let [db-details (get-app-db-connection-details)
            db (t2/insert-returning-instance! :model/Database
                                              {:name dev-db-name
                                               :description "Development database for analytics views and content"
                                               :engine (name db-type)
                                               :details db-details
                                               :is_audit false ; Important: not an audit DB
                                               :is_full_sync true
                                               :is_on_demand false
                                               :creator_id user-id
                                               :auto_run_queries true})]
        (log/info "Created analytics dev database:" (:id db))
        (sync/analyze-db! db)
        db))))

(defn delete-analytics-dev-database!
  "Deletes the analytics dev database and all related metadata."
  [db-id]
  (log/info "Deleting analytics dev database:" db-id)
  (t2/delete! :model/Database :id db-id)
  (log/info "Deleted analytics dev database"))

;;; ============================================================================
;;; YAML Transformation Logic
;;; ============================================================================

(defn transform-yaml
  "Transform a YAML data structure between canonical and dev formats. "
  [yaml-data direction opts]
  (walk/postwalk
   (fn [node]
     (case direction

       :from-canonical
       (condp = node

         canonical-db-id (:dev-db-name opts)
         canonical-creator-id (:user-id opts)

         node)

       :to-canonical
       (condp = node

         (:dev-db-name opts) canonical-db-id
         (:user-id opts) canonical-creator-id

         node)))
   yaml-data))

;;; ============================================================================
;;; YAML Import
;;; ============================================================================

(defn- copy-and-transform-yamls!
  "Copy YAMLs from source to temp directory, transforming them.

  Returns the temp directory path."
  [source-dir dev-db-name user-id dev-collection-entity-id]
  (let [temp-dir (Files/createTempDirectory "analytics-dev-import" (make-array FileAttribute 0))
        temp-path (.toFile temp-dir)
        opts {:dev-db-name dev-db-name
              :user-id user-id
              :dev-collection-entity-id dev-collection-entity-id}]
    (log/info "Copying and transforming YAMLs from" source-dir "to" temp-path)

    ;; Walk through all YAML files in source directory
    ;; Skip databases/ directory since we create the dev DB ourselves
    (doseq [^File file (file-seq (io/file source-dir))
            :when (and (.isFile file)
                       (.endsWith (.getName file) ".yaml")
                       (not (.contains (.getPath file) "/databases/")))]
      (let [relative-path (str/replace (.getPath file)
                                       (str (.getPath (io/file source-dir)) "/")
                                       "")
            target-file (io/file temp-path relative-path)]
        ;; Create parent directories
        (.mkdirs (.getParentFile target-file))

        ;; Read, transform, and write YAML
        (let [yaml-data (yaml/parse-string (slurp file))
              transformed (transform-yaml yaml-data :from-canonical opts)]
          (spit target-file (yaml/generate-string transformed)))))

    (log/info "YAML transformation complete")
    (.getPath temp-path)))

(defn import-analytics-content!
  "Import transformed YAMLs using serialization API.

  Steps:
  1. Copy YAMLs from resources/instance_analytics/ to temp dir
  2. Transform YAMLs (canonical -> dev format)
  3. Load using v2.ingest/ingest-yaml and v2.load/load-metabase!"
  [dev-db-name user-id dev-collection-entity-id]
  (let [source-dir "resources/instance_analytics"
        _ (when-not (.exists (io/file source-dir))
            (throw (ex-info "Analytics source directory not found" {:path source-dir})))

        temp-dir (copy-and-transform-yamls! source-dir dev-db-name user-id dev-collection-entity-id)]

    (log/info "Ingesting YAMLs from" temp-dir)
    (try
      (let [ingestion (v2.ingest/ingest-yaml temp-dir)
            report (v2.load/load-metabase! ingestion {:backfill? false})]
        (log/info "Import complete:" (count (:seen report)) "entities loaded")
        (when (seq (:errors report))
          (log/warn "Import had errors:" (:errors report)))
        report)
      (finally
        (when (.exists (io/file temp-dir))
          (doseq [^File file (reverse (file-seq (io/file temp-dir)))]
            (.delete file)))))))
