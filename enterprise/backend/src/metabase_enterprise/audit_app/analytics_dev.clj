(ns metabase-enterprise.audit-app.analytics-dev
  "Analytics development mode support for local development and testing.

  When MB_ANALYTICS_DEV_MODE=true, this namespace handles:
  - Creating a real Database entry for analytics views
  - Importing analytics content as editable (not read-only)
  - Exporting modified analytics content back to YAML files

  See metabase-enterprise.audit-app.settings/analytics-dev-mode for the setting."
  ^{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.audit-app.settings :as audit.settings]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as v2.storage]
   [metabase.models.serialization :as serdes]
   [metabase.audit-app.impl :as audit-app.impl]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.env :as mdb.env]
   [metabase.setup.core :as setup]
   [metabase.startup.core :as startup]
   [metabase.sync.core :as sync]
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
  (t2/select-one :model/Database :name canonical-db-id))

(defn create-analytics-dev-database!
  "Creates a Database entry pointing to the app database for analytics development.

  The database:
  - Points to the same database as the app DB
  - Named 'Internal Metabase Database'
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
                                              {:name canonical-db-id
                                               :description "Development database for analytics views and content"
                                               :engine (name db-type)
                                               :details db-details
                                               :is_audit false ; Important: not an audit DB
                                               :is_full_sync true
                                               :is_on_demand false
                                               :creator_id user-id
                                               :auto_run_queries true})]
        (log/info "Created analytics dev database:" (:id db))
        (sync/sync-database! db)
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

(defn- yaml->dev
  "Transform YAML from canonical format to dev format.

  Replaces canonical creator_id with actual user email."
  [yaml-data user-email]
  (walk/postwalk
   (fn [node]
     (if (= node canonical-creator-id)
       user-email
       node))
   yaml-data))

(defn- yaml->canonical
  "Transform YAML from dev format to canonical format.

  Replaces user email with canonical creator_id.
  For the Database entitiy, strips down to minimal required fields and sets is_audit to true."
  [file-name yaml-data user-email]
  (let [transformed (walk/postwalk
                     (fn [node]
                       (if (map? node)
                         (dissoc node :metabase_version :is_writable)
                         (if (= node user-email)
                           canonical-creator-id
                           node)))
                     yaml-data)
        is-database? (= file-name (str canonical-db-id ".yaml"))]
    (if is-database?
      (-> (select-keys transformed [:name :creator_id :is_sample :is_on_demand :serdes/meta
                                    :initial_sync_status :entity_id])
          (assoc :is_audit true))
      transformed)))

;;; ============================================================================
;;; YAML Import
;;; ============================================================================

(defn- copy-and-transform-yamls!
  "Copy YAMLs from source to temp directory, transforming them.

  Skips the database YAML since the database is created separately.

  Returns the temp directory path."
  [source-dir user-email]
  (let [temp-dir (Files/createTempDirectory "analytics-dev-import" (make-array FileAttribute 0))
        temp-path (.toFile temp-dir)]
    (log/info "Copying and transforming YAMLs from" source-dir "to" temp-path)
    (doseq [^File file (file-seq (io/file source-dir))
            :when (and (.isFile file)
                       (.endsWith (.getName file) ".yaml")
                       (not (= (.getName file) (str canonical-db-id ".yaml"))))]
      (let [relative-path (str/replace (.getPath file)
                                       (str (.getPath (io/file source-dir)) "/")
                                       "")
            target-file (io/file temp-path relative-path)]
        (.mkdirs (.getParentFile target-file))
        (let [yaml-data (yaml/parse-string (slurp file))
              transformed (yaml->dev yaml-data user-email)]
          (spit target-file (yaml/generate-string transformed)))))

    (log/info "YAML transformation complete")
    (.getPath temp-path)))

(defn import-analytics-content!
  "Import transformed YAMLs using serialization API.

  Steps:
  1. Copy YAMLs from resources/instance_analytics/ to temp dir
  2. Transform YAMLs (canonical -> dev format)
  3. Load using v2.ingest/ingest-yaml and v2.load/load-metabase!"
  [user-email]
  (let [source-dir "resources/instance_analytics"
        _ (when-not (.exists (io/file source-dir))
            (throw (ex-info "Analytics source directory not found" {:path source-dir})))

        temp-dir (copy-and-transform-yamls! source-dir user-email)]

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

;;; ============================================================================
;;; YAML Export
;;; ============================================================================

(defn export-dev-collection!
  "Export the dev collection using serialization API.

  Returns export report."
  [collection-id]
  (let [temp-dir (Files/createTempDirectory "analytics-dev-export" (make-array FileAttribute 0))
        temp-path (.toFile temp-dir)]
    (log/info "Exporting dev collection" collection-id "to" temp-path)
    (try
      (let [opts {:targets (v2.extract/make-targets-of-type "Collection" [collection-id])
                  :no-settings true :no-transforms true}
            report (serdes/with-cache (v2.storage/store! (v2.extract/extract opts) (.getPath temp-path)))]
        (log/info "Export complete:" (count (:seen report)) "entities exported")
        (when (seq (:errors report))
          (log/warn "Export had errors:" (:errors report)))
        {:report report
         :export-dir (.getPath temp-path)})
      (catch Exception e
        (doseq [^File file (reverse (file-seq temp-path))]
          (.delete file))
        (throw e)))))

(defn- transform-exported-yamls!
  "Transform exported YAMLs from dev format back to canonical.

  Reads YAMLs from export-dir, transforms them, writes to target-dir."
  [export-dir target-dir user-email]
  (log/info "Transforming exported YAMLs to canonical format")
  (doseq [^File file (file-seq (io/file export-dir))
          :when (and (.isFile file)
                     (.endsWith (.getName file) ".yaml")
                     (or (not (.contains (.getPath file) "/databases/"))
                         (and (.contains (.getPath file) (str "/databases/" canonical-db-id))
                              (or (= (.getName file) (str canonical-db-id ".yaml"))
                                  (.contains (.getPath file) "/tables/v_")))))]
    (let [relative-path (str/replace (.getPath file)
                                     (str (.getPath (io/file export-dir)) "/")
                                     "")
          target-file (io/file target-dir relative-path)]
      (.mkdirs (.getParentFile target-file))
      (let [yaml-data (yaml/parse-string (slurp file))
            transformed (yaml->canonical (.getName file) yaml-data user-email)]
        (spit target-file (yaml/generate-string transformed))))))

(defn export-analytics-content!
  "Export dev collection and transform back to canonical format."
  [collection-id user-email target-dir]
  (let [{:keys [export-dir report]} (export-dev-collection! collection-id)
        export-path (io/file export-dir)]
    (try
      (transform-exported-yamls! export-dir target-dir user-email)
      {:status :success
       :export-report report}
      (finally
        (when (.exists export-path)
          (doseq [^File file (reverse (file-seq export-path))]
            (.delete file)))))))

;;; ============================================================================
;;; Startup Hook
;;; ============================================================================

(defn- first-admin-user
  "Get the first admin user (by ID)."
  []
  (t2/select-one [:model/User :id :email] :is_superuser true {:order-by [[:id :asc]]}))

(defn find-analytics-collection
  "Get the analytics collection"
  []
  (t2/select-one :model/Collection :entity_id @#'audit-app.impl/default-audit-collection-entity-id))

(defn- analytics-content-loaded?
  "Check if analytics content has already been imported."
  []
  (and (find-analytics-dev-database)
       (find-analytics-collection)))

(defmethod startup/def-startup-logic! ::analytics-dev-mode-setup
  [_]
  (when (audit.settings/analytics-dev-mode)
    (future
      (try
        (log/info "Analytics dev mode enabled, waiting for user setup...")
        ;; Wait for user setup on new installs
        (while (not (setup/has-user-setup))
          (Thread/sleep 1000))
        (log/info "User setup complete, checking analytics dev environment...")
        (if (analytics-content-loaded?)
          (log/info "Analytics dev environment already set up, skipping initialization")
          (when-let [admin-user (first-admin-user)]
            (log/info "Setting up analytics dev environment with user:" (:email admin-user))
            (create-analytics-dev-database! (:id admin-user))
            (import-analytics-content! (:email admin-user))
            (log/info "Analytics dev environment ready")))
        (catch Exception e
          (log/error e "Failed to set up analytics dev environment"))))))
