(ns metabase-enterprise.advanced-config.file.databases
  (:require
   [clojure.set :as set]
   [clojure.spec.alpha :as s]
   [medley.core :as m]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.advanced-config.settings :as advanced-config.settings]
   [metabase.driver.util :as driver.u]
   [metabase.sample-data.core :as sample-data]
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

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_stub
  boolean?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_sample
  boolean?)

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
          :opt-un [:metabase-enterprise.advanced-config.file.databases.config-file-spec/settings
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_stub
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/is_sample]))

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

(defn- init-sample-database!
  "Handle an `:is_sample true` config entry. Validates that the entry refers to
   the canonical Sample Database (name + engine), then recreates it from the
   bundled fixture if one is not already present. The entry's `:details` are
   ignored — the sample DB always uses its bundled H2 file."
  [database]
  (when (or (not= (:name database) sample-data/sample-database-name)
            (not= (:engine database) "h2"))
    (throw (ex-info (format "Invalid is_sample entry: name must be %s and engine must be \"h2\"; got name %s, engine %s"
                            (pr-str sample-data/sample-database-name)
                            (pr-str (:name database))
                            (pr-str (:engine database)))
                    {:status-code 400
                     :name        (:name database)
                     :engine      (:engine database)})))
  (if (t2/exists? :model/Database :is_sample true)
    (log/info "Sample Database already present; ignoring is_sample config entry")
    (do
      (log/info (u/format-color :green "Recreating Sample Database from is_sample config entry"))
      (sample-data/extract-and-sync-sample-database!))))

(defn- init-from-config-file!
  [database]
  (cond
    (contains? database :delete)
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
        (t2/delete! :model/Database existing-database-id)))

    (:is_sample database)
    (init-sample-database! database)

    :else
    (do
      ;; assert that we are able to connect to this Database. Otherwise, throw an Exception.
      ;; Stubs are placeholders with no usable details, so we skip the connection test.
      (when-not (:is_stub database)
        (driver.u/can-connect-with-details? (keyword (:engine database)) (:details database) :throw-exceptions))
      (if-let [existing-database-id (t2/select-one-pk :model/Database :engine (:engine database), :name (:name database))]
        (if (:is_stub database)
          ;; A stub entry is just a placeholder to satisfy serdes references. If a real database
          ;; with this name+engine already exists, leave it alone — overwriting it with `:details {}`
          ;; and `:is_stub true` would break a working database.
          (log/info (u/format-color :yellow "Database %s %s already exists; ignoring stub entry"
                                    (:engine database) (pr-str (:name database))))
          (let [database (cond-> database
                           (:is_attached_dwh database) strip-attached-dwh-update-ks)]
            (log/info (u/format-color :blue "Updating Database %s %s" (:engine database) (pr-str (:name database))))
            (t2/update! :model/Database existing-database-id (normalize-settings database))))
        (do
          (log/info (u/format-color :green "Creating new %s Database %s" (:engine database) (pr-str (:name database))))
          (let [db (first (t2/insert-returning-instances! :model/Database (normalize-settings database)))]
            (cond
              (:is_stub database)
              (log/info "Created stub database; skipping sync.")

              (advanced-config.settings/config-from-file-sync-databases)
              (let [sync-database! (requiring-resolve 'metabase.sync.core/sync-database!)]
                (quick-task/submit-task! (fn [] (sync-database! db))))

              :else
              (log/info "Sync on database creation when initializing from file is disabled. Skipping sync."))))))))

(defmethod advanced-config.file.i/initialize-section! :databases
  [_section-name databases]
  (doseq [database databases]
    (init-from-config-file! database)))
