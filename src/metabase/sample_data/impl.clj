(ns metabase.sample-data.impl
  "Code related to adding the Sample Database on launch, or adding it back programmatically (used by the REST API)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
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

(defn sample-database-id
  "ID of the Sample Database if it exists, otherwise nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(defn- table-schema-for-engine
  "The schema value the sync process assigns to the sample database's tables for a given engine: H2 puts
  everything in the PUBLIC schema, SQLite reports no schema."
  [engine]
  (case engine
    :h2     "PUBLIC"
    :sqlite nil))

(defn- settings-sans-unsupported-features
  "The database's settings with feature-gated toggles the new `engine` can't support turned off, or nil when
  nothing needs to change. Leaving one enabled would make the Database model's before-update reject the
  engine change (e.g. `:database-enable-actions` when migrating to SQLite, which doesn't support actions)."
  [engine database]
  (let [disabled (into {}
                       (keep (fn [[setting feature]]
                               (when (and (get-in database [:settings setting])
                                          (not (driver.u/supports? engine feature database)))
                                 [setting false])))
                       {:database-enable-actions       :actions
                        :database-enable-table-editing :actions/data-editing})]
    (when (seq disabled)
      (log/warnf "Disabling %s on the sample database: not supported by engine %s"
                 (str/join ", " (map name (keys disabled))) engine)
      (merge (:settings database) disabled))))

(defn- migrate-sample-database-engine-in-place!
  "The only app-db differences between the H2 and
  SQLite sample databases are the Database record's engine/details and the tables' schema (H2 = \"PUBLIC\",
  SQLite = nil). So instead of deleting and rebuilding the database, edit those two things in place and
  re-sync to reconcile the remaining sync-derived field metadata. Every Database/Table/Field id is kept,
  so sample content, user-created content, permissions, and the Example collection all survive with no
  remapping, deletion, or re-seeding."
  [engine old-sample-db]
  (log/infof "Migrating sample database engine from %s to %s in place" (:engine old-sample-db) engine)
  (let [details  (try-to-extract-sample-database! engine)
        settings (settings-sans-unsupported-features engine old-sample-db)]
    (t2/with-transaction [_conn]
      (t2/update! :model/Database (:id old-sample-db)
                  (cond-> {:engine engine, :details details}
                    settings (assoc :settings settings)))
      (t2/update! :model/Table :db_id (:id old-sample-db) {:schema (table-schema-for-engine engine)})
      ;; Table-level permission rows denormalize the table's schema; keep them matching or schema-scoped
      ;; permission checks (e.g. schema visibility in the data picker) stop counting them. Raw table update:
      ;; the model's before-update rejects all updates, and delete+reinsert would churn ids for a rename that
      ;; doesn't change any permission value.
      (t2/query {:update (t2/table-name :model/DataPermissions)
                 :set    {:schema_name (table-schema-for-engine engine)}
                 :where  [:and
                          [:= :db_id (:id old-sample-db)]
                          [:not= :table_id nil]]}))
    (sync/sync-database! (t2/select-one :model/Database :id (:id old-sample-db)))))

(defn update-sample-database-if-needed!
  "Reconcile the existing sample database with the bundled one. When the bundled engine changed
  (H2 <-> SQLite) the existing sample database is migrated in place to the new engine (see
  [[migrate-sample-database-engine-in-place!]]); otherwise we just refresh its connection details in case
  the JAR has moved."
  ([]
   (update-sample-database-if-needed! (t2/select-one :model/Database :is_sample true)))

  ([sample-db]
   (when sample-db
     (let [engine (sample-database-engine)]
       (if (not= (:engine sample-db) engine)
         (migrate-sample-database-engine-in-place! engine sample-db)
         (let [intended (try-to-extract-sample-database! engine)]
           (when (not= (:details sample-db) intended)
             (t2/update! :model/Database (:id sample-db) {:details intended}))))))))
