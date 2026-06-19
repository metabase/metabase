(ns metabase.sample-data.impl
  "Code related to adding the Sample Database on launch, or adding it back programmatically (used by the REST API)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.plugins.core :as plugins]
   [metabase.sample-data.example-content :as example-content]
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

(def ^:private ^String sqlite-sample-database-filename "sample-database.sqlite")

(def ^:private ^String h2-sample-database-filename "sample-database.db.mv.db")

(defn- sample-database-filename
  [engine]
  (case engine
    :h2     h2-sample-database-filename
    :sqlite sqlite-sample-database-filename))

(defn- sample-db-dir-from-env
  "Change the folder from which we load the sample database, used locally to avoid E2E to use the same file used for local development"
  []
  (when-let [path (System/getenv "MB_INTERNAL_DO_NOT_USE_SAMPLE_DB_DIR")]
    (u.files/get-path path)))

;; Reuse the plugins directory for the destination to extract the sample database because it's pretty much guaranteed
;; to exist and be writable.
(defn- target-path
  [engine]
  (let [base-dir (or (sample-db-dir-from-env)
                     (plugins/plugins-dir))]
    (u.files/append-to-path base-dir (sample-database-filename engine))))

(defn- extract-sample-database!
  "Copy the bundled sample database file out to the plugins dir and return its destination path."
  [engine]
  (u.files/with-open-path-to-resource [sample-db-path (sample-database-filename engine)]
    (let [dest-path (target-path engine)]
      (u.files/copy-file! sample-db-path dest-path)
      (str dest-path))))

(defn- sample-database-details
  "Build the `:details` map for the sample database extracted to `dest-path`, per engine."
  [engine dest-path]
  (case engine
    ;; SQLite `:details` only need a filesystem path. URL-decode in case it got URL-encoded from a JAR `URL`.
    ;; The bundled file is read-only.
    :sqlite {:db (codec/url-decode dest-path), :read-only? true}
    ;; H2 connects to the file by path (sans the `.mv.db` suffix).
    :h2     {:db (-> (str "file:" dest-path)
                     (str/replace #"\.mv\.db$" "")
                     codec/url-decode
                     (str ";USER=GUEST;PASSWORD=guest"))}))

(defn- try-to-extract-sample-database!
  "Extracts the sample database out of the JAR to the plugins dir and returns a db-details map. SQLite-JDBC
   requires a real file on disk, so the plugins-dir-must-be-writable assumption is load-bearing."
  [engine]
  (let [filename (sample-database-filename engine)
        ^URL resource (io/resource filename)]
    (when-not resource
      (throw (ex-info (trs "Sample database file ''{0}'' cannot be found." filename)
                      {:filename filename})))
    (when (:temp (plugins/plugins-dir-info))
      (log/warn (str "Plugins directory is a temp directory; the sample database will be re-extracted on every startup. "
                     "Set MB_PLUGINS_DIR to a writable directory to make this stable.")))
    (sample-database-details engine (extract-sample-database! engine))))

(defn- sample-database-engine
  "Engine of the bundled sample database. Defaults to `:sqlite` (what we ship). E2E tests set
  `MB_SAMPLE_DATABASE_ENGINE=h2` so the sample database is the H2 one the suite was written against,
  deferring the test migration to SQLite without changing what we ship."
  []
  (if (= "h2" (System/getenv "MB_SAMPLE_DATABASE_ENGINE"))
    :h2
    :sqlite))

(defn extract-and-sync-sample-database!
  "Adds the sample database as a Metabase DB if it doesn't already exist. If it does exist in the app DB,
  we update its details."
  []
  (try
    (log/info "Loading sample database")
    (let [engine (sample-database-engine)
          details (try-to-extract-sample-database! engine)
          db (if (t2/exists? :model/Database :is_sample true)
               (t2/select-one :model/Database (first (t2/update-returning-pks! :model/Database :is_sample true {:details details})))
               (first (t2/insert-returning-instances! :model/Database
                                                      :name      sample-database-name
                                                      :details   details
                                                      :engine    engine
                                                      :is_sample true)))]
      (log/debug "Syncing Sample Database...")
      (sync/sync-database! db))
    (log/debug "Finished adding Sample Database.")
    (catch Throwable e
      (log/error e "Failed to load sample database"))))

(defn- sample-database-dashboard-ids
  "IDs of Dashboards holding at least one card backed by `database-id`. Captured before the sample
  database is deleted so the dashboards it empties out can be pruned afterward."
  [database-id]
  (t2/select-fn-set :dashboard_id :model/DashboardCard
                    :card_id [:in {:select [:id]
                                   :from   [(t2/table-name :model/Card)]
                                   :where  [:= :database_id database-id]}]))

(defn- delete-emptied-dashboards!
  "Delete whichever of `dashboard-ids` no longer have any dashcards. A sample dashboard whose cards
  were all removed with the sample database is deleted; a dashboard that still has cards (e.g. mixes
  in cards from another database) is left alone."
  [dashboard-ids]
  (when (seq dashboard-ids)
    (let [non-empty (t2/select-fn-set :dashboard_id :model/DashboardCard :dashboard_id [:in dashboard-ids])
          empty-ids (remove (or non-empty #{}) dashboard-ids)]
      (when (seq empty-ids)
        (t2/delete! :model/Dashboard :id [:in empty-ids])))))

(defn- replace-sample-database!
  "The bundled sample database's engine changed (e.g. H2 -> SQLite on upgrade). The old sample
  Database's tables, fields, and connection details are incompatible with the new engine, so rather
  than remapping content we drop the old sample Database wholesale and extract + sync the new one.
  Deleting the Database cascades to its Cards and those cards' dashcards; Dashboards left empty as a
  result are deleted too.

  The cleanup runs unconditionally (an incompatible sample database should never linger), but the new
  Sample Database and its Example collection are only recreated when sample content is enabled - and
  the Example collection is skipped under test endpoints, matching fresh-install seeding.

  The Example collection itself is left in place: [[example-content/recreate-example-content!]] reuses it
  (matching by entity id) and replaces only the bundled cards/dashboards, so any content a user filed into
  the Example collection survives the engine swap."
  [engine old-sample-db]
  (log/infof "Bundled sample database engine changed from %s to %s; replacing the sample database"
             (:engine old-sample-db) engine)
  (let [new-db (t2/with-transaction [_conn]
                 (let [dashboard-ids (sample-database-dashboard-ids (:id old-sample-db))]
                   (t2/delete! :model/Database (:id old-sample-db))
                   (delete-emptied-dashboards! dashboard-ids))
                 (when (config/load-sample-content?)
                   (first (t2/insert-returning-instances! :model/Database
                                                          :name sample-database-name
                                                          :details (try-to-extract-sample-database! engine)
                                                          :engine engine
                                                          :is_sample true))))]
    (when new-db
      (try
        (sync/sync-database! new-db)
        (catch Throwable e
          (log/error e "Failed to sync the replacement sample database")))
      (when-not (config/config-bool :mb-enable-test-endpoints)
        (example-content/recreate-example-content! (:id new-db))))))

(defn update-sample-database-if-needed!
  "Reconcile the existing sample database with the bundled one. When the bundled engine changed
  (H2 <-> SQLite) the old sample database is replaced (see [[replace-sample-database!]]); otherwise
  we just refresh its connection details in case the JAR has moved."
  ([]
   (update-sample-database-if-needed! (t2/select-one :model/Database :is_sample true)))

  ([sample-db]
   (when sample-db
     (let [engine (sample-database-engine)]
       (if (not= (:engine sample-db) engine)
         (replace-sample-database! engine sample-db)
         (let [intended (try-to-extract-sample-database! engine)]
           (when (not= (:details sample-db) intended)
             (t2/update! :model/Database (:id sample-db) {:details intended}))))))))
