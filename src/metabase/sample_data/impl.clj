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
  [base-path]
  (-> base-path
      (str/replace #"\.mv\.db$" "")        ; strip the .mv.db suffix from the path
      codec/url-decode                     ; for some reason the path can get URL-encoded so we decode it here
      (str ";USER=GUEST;PASSWORD=guest"))) ; specify the GUEST user account created for the DB

(defn- jar-db-details
  [^URL resource]
  (-> (.getPath resource)
      (str/replace #"^file:" "zip:") ; to connect to an H2 DB inside a JAR just replace file: with zip: (this doesn't
                                     ;   do anything when running from the Clojure CLI, which has no `file:` prefix)
      process-sample-db-path))

(defn- extract-sample-database!
  []
  (u.files/with-open-path-to-resource [sample-db-path sample-database-filename]
    (let [dest-path (target-path)]
      (u.files/copy-file! sample-db-path dest-path)
      (-> (str "file:" dest-path)
          process-sample-db-path))))

(defn- try-to-extract-sample-database!
  "Tries to extract the sample database out of the JAR (for performance) and then returns a db-details map
   containing a path to the copied database."
  []
  (let [resource (io/resource sample-database-filename)]
    (when-not resource
      (throw (Exception. (trs "Sample database DB file ''{0}'' cannot be found."
                              sample-database-filename))))
    {:db
     (if-not (:temp (plugins/plugins-dir-info))
       (extract-sample-database!)
       (do
         ;; If the plugins directory is a temp directory, fall back to reading the DB directly from the JAR until a
         ;; working plugins directory is available. (We want to ensure the sample DB is in a stable location.)
         (log/warn (str "Sample database could not be extracted to the plugins directory,"
                        "which may result in slow startup times. "
                        "Please set MB_PLUGINS_DIR to a writable directory and restart Metabase."))
         (jar-db-details resource)))}))

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
                                                      :engine    :h2
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
  (t2/select-fn-set :dashboard_id [:model/DashboardCard :dashboard_id]
                    :card_id [:in {:select [:id]
                                   :from   [(t2/table-name :model/Card)]
                                   :where  [:= :database_id database-id]}]))

(defn- delete-emptied-dashboards!
  "Delete Dashboards from `dashboard-ids` that no longer hold any card-backed dashcard (the sample
  dashboards are built entirely from sample cards + text/heading cards, so once the sample cards are
  gone they are empty). A dashboard the user mixed their own card into is left alone."
  [dashboard-ids]
  (when (seq dashboard-ids)
    (let [non-empty (t2/select-fn-set :dashboard_id [:model/DashboardCard :dashboard_id]
                                      :dashboard_id [:in dashboard-ids]
                                      :card_id [:not= nil])
          empty-ids (remove (or non-empty #{}) dashboard-ids)]
      (when (seq empty-ids)
        (t2/delete! :model/Dashboard :id [:in empty-ids])))))

(defn- replace-non-h2-sample-database!
  "A newer version installed a non-H2 (e.g. SQLite) bundled sample database that this version cannot use.
  Delete it - along with the content it leaves empty - then install and sync the bundled H2 sample
  database and recreate the Example content in its place. Mirrors the H2 -> SQLite upgrade replacement a
  newer version performs, but in reverse. The old sample database's tables/fields/cards go with it (its
  cards can't work without it anyway); the Example collections are reused by
  [[example-content/recreate-example-content!]]."
  [old-sample-db]
  (log/infof "Sample database engine is %s, which this version does not support; replacing it with the bundled H2 sample database"
             (:engine old-sample-db))
  (let [dashboard-ids (sample-database-dashboard-ids (:id old-sample-db))]
    (t2/delete! :model/Database (:id old-sample-db))
    (delete-emptied-dashboards! dashboard-ids))
  ;; Only reinstall when sample content is enabled (matching fresh-install seeding); the broken sample
  ;; database is removed either way.
  (when (config/load-sample-content?)
    (extract-and-sync-sample-database!)
    (when-let [new-db (t2/select-one :model/Database :is_sample true)]
      (example-content/recreate-example-content! (:id new-db)))))

(defn update-sample-database-if-needed!
  "Reconcile the existing sample database on launch. If a newer version left behind a non-H2 sample
  database this version can't use (e.g. after a downgrade), replace it with the bundled H2 one; otherwise
  just refresh its connection details in case the JAR has moved."
  ([]
   (update-sample-database-if-needed! (t2/select-one :model/Database :is_sample true)))

  ([sample-db]
   (when sample-db
     (if (not= :h2 (:engine sample-db))
       (replace-non-h2-sample-database! sample-db)
       (let [intended (try-to-extract-sample-database!)]
         (when (not= (:details sample-db) intended)
           (t2/update! :model/Database (:id sample-db) {:details intended})))))))
