(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
   [metabase.app-db.core :as mdb]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(def keep-me
  "Marker so callers can `(comment ...keep-me)` to retain the require that registers the settings in this ns."
  nil)

(defsetting database-enable-workspaces
  (deferred-tru "Whether to enable Workspaces for a specific Database.")
  :default        false
  :type           :boolean
  :feature        :workspaces
  :driver-feature :workspace
  :visibility     :public
  :export?        false
  :database-local :only)

(defsetting workspaces-enabled
  (deferred-tru "Whether this instance is a workspace. A transform on a database that has a `database-workspace-schema` writes to that schema instead of to its production table, and later reads of the production table read the workspace copy. A transform on a database that has no `database-workspace-schema` is refused. Not the per-database switch that a parent uses to offer workspaces (`database-enable-workspaces`). Turning this setting off through the settings API, `config.yml`, or `DELETE /api/ee/workspace-instance/current` deletes every table remapping (the record that sends reads to the workspace copy). Unsetting `MB_WORKSPACES_ENABLED` does not. While `MB_WORKSPACES_ENABLED` is set, a write of the other value is refused, a `config.yml` that sets the other value stops Metabase from starting, and `PUT /api/database/:id` and `POST /api/ee/workspace-instance/current` refuse to change a database''s `database-workspace-schema`.")
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    false
  :audit      :getter
  :setter     (fn [new-value]
                (let [new-value (cond-> new-value (string? new-value) setting/string->boolean)
                      env-value (some-> (setting/env-var-value :workspaces-enabled) setting/string->boolean)]
                  ;; The env var wins over the stored value, so a write of the other value would report success and
                  ;; change nothing. A nil write resets the stored value, which the env var hides, so it's allowed.
                  (when (and (some? env-value) (some? new-value) (not= new-value env-value))
                    (throw (ex-info (tru "workspaces-enabled is set to {0} by the MB_WORKSPACES_ENABLED env var and can''t be changed at runtime."
                                         env-value)
                                    {:status-code 400})))
                  (when (and (true? new-value) (ws.db/any-workspace-exists?))
                    (throw (ex-info (tru "This instance manages workspaces, so it can''t run in workspace mode.")
                                    {:status-code 400})))
                  ;; Delete here, once, on the node that turns workspace mode off, and before the write: a delete that
                  ;; failed after it would leave the rows with workspace mode off. Not in :on-change, which runs on
                  ;; every node inside whatever transaction first reads the new value.
                  (when (and (nil? env-value)
                             (not (true? new-value))
                             (setting/get-value-of-type :boolean :workspaces-enabled))
                    (ws.db/delete-instance-table-remappings!))
                  (setting/set-value-of-type! :boolean :workspaces-enabled new-value)))
  ;; Outside workspace mode a node trusts its cache of the Databases with remappings, and rows may have changed
  ;; while it was in workspace mode. Fires on every node when its settings cache picks up the change.
  :on-change  (fn [_old-value _new-value]
                (table-remapping/invalidate-database-ids!)))

(defsetting database-workspace-schema
  (deferred-tru "The schema this database''s transforms write to when `workspaces-enabled` is on. On engines without schemas (MySQL), a database name. While `MB_WORKSPACES_ENABLED` is set, this setting changes only through `config.yml` or a restart with new configuration: `PUT /api/database/:id` and `POST /api/ee/workspace-instance/current` refuse to change it.")
  :type           :string
  :encryption     :no
  :visibility     :admin
  :export?        false
  :database-local :only)

(defsetting instance-workspace
  (deferred-tru "Removed: replaced by `workspaces-enabled` and each database''s `database-workspace-schema`. A value stored here, or set by `MB_INSTANCE_WORKSPACE`, is translated into those settings at startup.")
  :type       :json
  :encryption :no
  :visibility :internal
  :export?    false
  :audit      :never
  :doc        false)

(defn- set-request-workspaces-enabled!
  "Setter of [[request-workspaces-enabled]]: turn the row-level security that keeps the rows of workspaces apart on or
  off, then store `new-value`."
  [new-value]
  (let [new-value (boolean (cond-> new-value (string? new-value) setting/string->boolean))]
    (if new-value
      (do
        (when-not (= :postgres (mdb/db-type))
          (throw (ex-info (tru "Workspaces that a request names need a PostgreSQL application database.")
                          {:status-code 400})))
        (when (ws.db/row-security-bypassed?)
          (throw (ex-info (tru "Workspaces that a request names need an application database user that row-level security applies to, not a superuser or a user with BYPASSRLS.")
                          {:status-code 400}))))
      (when (and (= :postgres (mdb/db-type)) (ws.db/workspace-owned-rows-exist?))
        (throw (ex-info (tru "Workspaces own Tables or Fields, which every connection would see without row-level security. Delete those workspaces first.")
                        {:status-code 400}))))
    (when (= :postgres (mdb/db-type))
      (ws.db/set-row-security! new-value))
    (setting/set-value-of-type! :boolean :request-workspaces-enabled new-value)))

(defsetting request-workspaces-enabled
  (deferred-tru "Whether a superuser''s request can name a workspace of this instance with the `X-Metabase-Workspace-Id` header. Turning it on turns on PostgreSQL row-level security on `metabase_table` and `metabase_field`, so each workspace sees only the Tables and Fields it shares or owns. It needs a PostgreSQL application database whose user row-level security applies to. With it on, `pg_dump` of the application database by its owner needs `--enable-row-security`. It can''t turn off while workspaces own Tables or Fields.")
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    false
  :audit      :getter
  :setter     set-request-workspaces-enabled!)
