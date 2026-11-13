(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
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
  (deferred-tru "Whether this instance is a workspace. A transform on a database that has a `database-workspace-schema` writes to that schema instead of to its production table, and later reads of the production table read the workspace copy. A transform on a database that has no `database-workspace-schema` is refused. Not the per-database switch that a parent uses to offer workspaces (`database-enable-workspaces`). Turning this setting off through the settings API, `config.yml`, or `DELETE /api/ee/workspace-instance/current` deletes every table remapping (the record that sends reads to the workspace copy). Unsetting `MB_WORKSPACES_ENABLED` does not. While `MB_WORKSPACES_ENABLED` is set, a write of the other value is refused, and a `config.yml` that sets the other value stops Metabase from starting.")
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
                    (ws.db/delete-all-table-remappings!))
                  (setting/set-value-of-type! :boolean :workspaces-enabled new-value)))
  ;; Outside workspace mode a node trusts its cache of the Databases with remappings, and rows may have changed
  ;; while it was in workspace mode. Fires on every node when its settings cache picks up the change.
  :on-change  (fn [_old-value _new-value]
                (table-remapping/invalidate-database-ids!)))

(defsetting database-workspace-schema
  (deferred-tru "The schema this database''s transforms write to when `workspaces-enabled` is on. On engines without schemas (MySQL), a database name.")
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
