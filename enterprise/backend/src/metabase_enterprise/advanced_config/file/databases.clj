(ns metabase-enterprise.advanced-config.file.databases
  (:require
   [clojure.spec.alpha :as s]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase.driver.util :as driver.u]
   [metabase.models.database :refer [Database]]
   [metabase.models.setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defsetting config-from-file-sync-databases
  "Whether to sync newly created Databases during config-from-file initialization. By default, true, but you can disable
  this behavior if you want to sync it manually or use SerDes to populate its data model."
  :visibility :internal
  :type       :boolean
  :default    true
  :audit      :getter)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/name
  string?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/engine
  string?)

(s/def :metabase-enterprise.advanced-config.file.databases.config-file-spec/details
  map?)

(s/def ::config-file-spec
  (s/keys :req-un [:metabase-enterprise.advanced-config.file.databases.config-file-spec/engine
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/name
                   :metabase-enterprise.advanced-config.file.databases.config-file-spec/details]))

(defmethod advanced-config.file.i/section-spec :databases
  [_section]
  (s/spec (s/* ::config-file-spec)))

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
      (when-let [existing-database-id (t2/select-one-pk Database :engine (:engine database), :name (:name database))]
        (log/info (u/format-color :blue "Deleting Database %s %s" (:engine database) (pr-str (:name database))))
        (t2/delete! Database existing-database-id)))
    (do
      ;; assert that we are able to connect to this Database. Otherwise, throw an Exception.
      (driver.u/can-connect-with-details? (keyword (:engine database)) (:details database) :throw-exceptions)
      (if-let [existing-database-id (t2/select-one-pk Database :engine (:engine database), :name (:name database))]
        (do
          (log/info (u/format-color :blue "Updating Database %s %s" (:engine database) (pr-str (:name database))))
          (t2/update! Database existing-database-id database))
        (do
          (log/info (u/format-color :green "Creating new %s Database %s" (:engine database) (pr-str (:name database))))
          (let [db (first (t2/insert-returning-instances! Database database))]
            (if (config-from-file-sync-databases)
              ((requiring-resolve 'metabase.sync/sync-database!) db)
              (log/info "Sync on database creation when initializing from file is disabled. Skipping sync."))))))))

(defmethod advanced-config.file.i/initialize-section! :databases
  [_section-name databases]
  (doseq [database databases]
    (init-from-config-file! database)))
