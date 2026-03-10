(ns metabase-enterprise.advanced-config.file.databases
  (:require
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [medley.core :as m]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.settings :as advanced-config.settings]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/name
  string?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/engine
  string?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/details
  map?)

(defn- valid-regex-patterns? [patterns]
  (every? (fn [pattern]
            (try
              (boolean (re-pattern pattern))
              (catch Exception e (log/error e) false)))
          patterns))

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/settings
  (s/and
   map?
   (fn cruft-patterns-are-valid? [settings]
     (->> [(:auto-cruft-tables settings
                               ;; we access auto.cruft.* with _'s here. Because we may expect to see underscores from
                               ;; the yaml file, this is validated first then normalized into kebab-case after
                               ;; validation in [[normalize-settings]].
                               (:auto_cruft_tables settings))
           (:auto-cruft-columns settings
                                (:auto_cruft_columns settings))]
          (remove nil?)
          (every? valid-regex-patterns?)))))

(s/def ::config-file-spec
  (s/keys :req-un [:metabase-enterprise.advanced-config.file.databases.config-file-spec/engine
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/name
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/details]
          :opt-un [:metabase-enterprise.advanced-config.file.databases.config-file-spec/settings]))

(defmethod advanced-config.file.i/section-spec :databases
  [_section]
  (s/spec (s/* ::config-file-spec)))

(defn- normalize-settings [db]
  (m/update-existing db :settings set/rename-keys
                     {:auto_cruft_tables :auto-cruft-tables
                      :auto_cruft_columns :auto-cruft-columns}))

(defn- strip-attached-dwh-update-ks
  "When using the MB Cloud attached DWH, we don't want all config keys to be set on every restart
  because the customer might have changed some of them meanwhile."
  [database]
  (dissoc database :uploads_enabled :uploads_schema_name :uploads_table_prefix))

(defn- init-from-config-file!
  [database]
  (if (contains? database :delete)
    ;; Databases can be managed as a service by us.  When the service is canceled, we need to delete any information
    ;; Metabase has about them, including any stored credentials.  This is a config file flag instead of a CLI command,
    ;; so we can ensure the database stays deleted even after restoring backups.
    (let [magic-request (format "DELETE_WITH_DEPENDENTS:%s" (:name database))]
      (log/info (u/format-color :blue "Deleting databases via the config file is an internal feature subject to breaking changes."))
      (when (not= magic-request (:delete database))
        (throw (ex-info (format "To delete database %s set `delete` to %s" (pr-str (:name database)) (pr-str magic-request))
                        {:database-name (:name database)})))
      (when-let [existing-database-id (t2/select-one-pk :model/Database :engine (:engine database), :name (:name database))]
        (log/info (u/format-color :blue "Deleting Database %s %s" (:engine database) (pr-str (:name database))))
        ;; TODO: remove, temp hack. see: https://metaboat.slack.com/archives/CKZEMT1MJ/p1770242308801029?thread_ts=1770241635.689819&cid=CKZEMT1MJ
        (t2/delete! :model/Transform :source_database_id existing-database-id)
        (t2/delete! :model/Database existing-database-id)))
    (do
      ;; assert that we are able to connect to this Database. Otherwise, throw an Exception.
      (driver.u/can-connect-with-details? (keyword (:engine database)) (:details database) :throw-exceptions)
      (if-let [existing-database-id (t2/select-one-pk :model/Database :engine (:engine database), :name (:name database))]
        (let [database (cond-> database
                         (:is_attached_dwh database) strip-attached-dwh-update-ks)]
          (log/info (u/format-color :blue "Updating Database %s %s" (:engine database) (pr-str (:name database))))
          (t2/update! :model/Database existing-database-id (normalize-settings database)))
        (do
          (log/info (u/format-color :green "Creating new %s Database %s" (:engine database) (pr-str (:name database))))
          (let [db (first (t2/insert-returning-instances! :model/Database (normalize-settings database)))]
            (if (advanced-config.settings/config-from-file-sync-databases)
              (let [sync-database! (requiring-resolve 'metabase.sync.core/sync-database!)]
                (quick-task/submit-task! (fn [] (sync-database! db))))
              (log/info "Sync on database creation when initializing from file is disabled. Skipping sync."))))))))

(defmethod advanced-config.file.i/initialize-section! :databases
  [_section-name databases]
  (doseq [database databases]
    (init-from-config-file! database)))
