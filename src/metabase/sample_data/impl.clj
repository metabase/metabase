(ns metabase.sample-data.impl
  "Code related to adding the Sample Database on launch, or adding it back programmatically (used by the REST API)."
  (:require
   [clojure.java.io :as io]
   [metabase.plugins.core :as plugins]
   [metabase.sync.core :as sync]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.util.codec :as codec]
   [toucan2.core :as t2])
  (:import
   (java.net URL)))

(set! *warn-on-reflection* true)

(def ^String sample-database-name
  "Canonical name of the bundled Sample Database. Shared with consumers that need to
  identify or validate the sample DB (e.g. workspace-manager config import)."
  "Sample Database")

(def ^:private ^String sample-database-filename "sample-database.db.mv.db")

(defn- sample-db-dir-from-env
  "Change the folder from which we load the sample database, used locally to avoid E2E to use the same file used for local development"
  []
  (when-let [path (System/getenv "MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR")]
    (u.files/get-path path)))

;; Reuse the plugins directory for the destination to extract the sample database because it's pretty much guaranteed
;; to exist and be writable.
(defn- target-path
  []
  (let [base-dir (or (sample-db-dir-from-env)
                     (plugins/plugins-dir))]
    (u.files/append-to-path base-dir sample-database-filename)))

(defn- process-sample-db-path
  "SQLite `:details` only need a filesystem path. URL-decode in case the path
   gets URL-encoded when sourced from a JAR `URL`."
  [base-path]
  (codec/url-decode base-path))

(defn- extract-sample-database!
  []
  (u.files/with-open-path-to-resource [sample-db-path sample-database-filename]
    (let [dest-path (target-path)]
      (u.files/copy-file! sample-db-path dest-path)
      (process-sample-db-path (str dest-path)))))

(defn- try-to-extract-sample-database!
  "Extracts the sample database out of the JAR to the plugins dir and returns a
   db-details map containing the filesystem path. SQLite-JDBC requires a real
   file on disk; unlike H2 it cannot read straight from a JAR, so the
   plugins-dir-must-be-writable assumption is now load-bearing."
  []
  (let [^URL resource (io/resource sample-database-filename)]
    (when-not resource
      (throw (ex-info (trs "Sample database file ''{0}'' cannot be found."
                           sample-database-filename)
                      {:filename sample-database-filename})))
    (when (:temp (plugins/plugins-dir-info))
      (log/warn (str "Plugins directory is a temp directory; the sample database will be re-extracted on every startup. "
                     "Set MB_PLUGINS_DIR to a writable directory to make this stable.")))
    {:db (extract-sample-database!)}))

(defn extract-and-sync-sample-database!
  "Adds the sample database as a Metabase DB if it doesn't already exist. If it does exist in the app DB,
  we update its details."
  []
  (try
    (log/info "Loading sample database")
    (let [details (try-to-extract-sample-database!)
          db (if (t2/exists? :model/Database :is_sample true)
               (t2/select-one :model/Database (first (t2/update-returning-pks! :model/Database :is_sample true {:details details})))
               (first (t2/insert-returning-instances! :model/Database
                                                      :name      sample-database-name
                                                      :details   details
                                                      :engine    :sqlite
                                                      :is_sample true)))]
      (log/debug "Syncing Sample Database...")
      (sync/sync-database! db))
    (log/debug "Finished adding Sample Database.")
    (catch Throwable e
      (log/error e "Failed to load sample database"))))

(defn update-sample-database-if-needed!
  "Update the path to the sample database DB if it exists in case the JAR has moved."
  ([]
   (update-sample-database-if-needed! (t2/select-one :model/Database :is_sample true)))

  ([sample-db]
   (when sample-db
     (let [intended (try-to-extract-sample-database!)]
       (when (not= (:details sample-db) intended)
         (t2/update! :model/Database (:id sample-db) {:details intended}))))))
