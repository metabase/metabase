(ns metabase.warehouses.config-file
  "Create or update a `:model/Database` from a config-file-shaped database entry.

   Extracted from the advanced-config `:databases` section loader so it can be
   shared by any module that materializes databases from a declarative config
   (advanced-config's `config.yml`, the workspaces runtime bind). Lives in
   `warehouses` because that module owns `:model/Database` and already depends on
   `sync` and `driver` — keeping it here avoids a circular dependency between the
   consuming EE modules."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [toucan2.core :as t2]))

;; `sample-data` and `sync` are resolved lazily: requiring them at load time would
;; create a cycle (warehouses.core -> sample-data/sync -> driver/qp -> warehouses.core).
;; Both are only needed at runtime when a config entry is actually processed.

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
  (let [sample-database-name @(requiring-resolve 'metabase.sample-data.core/sample-database-name)]
    (when (or (not= (:name database) sample-database-name)
              (not= (:engine database) "h2"))
      (throw (ex-info (format "Invalid is_sample entry: name must be %s and engine must be \"h2\"; got name %s, engine %s"
                              (pr-str sample-database-name)
                              (pr-str (:name database))
                              (pr-str (:engine database)))
                      {:status-code 400
                       :name        (:name database)
                       :engine      (:engine database)})))
    (if (t2/exists? :model/Database :is_sample true)
      (log/info "Sample Database already present; ignoring is_sample config entry")
      (do
        (log/info (u/format-color :green "Recreating Sample Database from is_sample config entry"))
        ((requiring-resolve 'metabase.sample-data.core/extract-and-sync-sample-database!))))))

(defn upsert-database-from-config!
  "Create, update, or delete a `:model/Database` from a single config-file `database`
   entry `{:name :engine :details ...}` (optionally `:settings`, `:is_stub`,
   `:is_sample`, `:delete`).

   `sync?` controls whether a newly-created (non-stub, non-sample) database is
   synced: callers pass their own policy (advanced-config gates on a setting; other
   callers may always sync). Sync runs asynchronously via a quick-task.

   Connection details are validated (and an exception thrown) before a real database
   is created or updated; stubs skip the connection test."
  [database {:keys [sync?] :or {sync? false}}]
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

              sync?
              (let [sync-database! (requiring-resolve 'metabase.sync.core/sync-database!)]
                (quick-task/submit-task! (fn [] (sync-database! db))))

              :else
              (log/info "Sync on database creation when initializing from file is disabled. Skipping sync."))))))))
