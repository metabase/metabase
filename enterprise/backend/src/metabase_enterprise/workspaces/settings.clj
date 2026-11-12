(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
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
  (deferred-tru "Whether this instance is a workspace: transforms on a database with a `database-workspace-schema` write there instead of to production, and later reads of their output follow. Not the per-database switch a parent uses to offer workspaces (`database-enable-workspaces`). Turning it off through the settings API, `config.yml`, or `DELETE /api/ee/workspace-instance/current` deletes every table remapping; unsetting this env var does not.")
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    false
  :audit      :getter
  :setter     (fn [new-value]
                ;; The env var wins over the stored value, so a different write would report success and change
                ;; nothing, while its :on-change still deleted every remap row.
                (when-let [env-value (setting/env-var-value :workspaces-enabled)]
                  (when (not= (u/lower-case-en (str new-value)) (u/lower-case-en env-value))
                    (throw (ex-info (str "workspaces-enabled is set to " env-value " by the MB_WORKSPACES_ENABLED env var"
                                         " and can't be changed at runtime.")
                                    {:status-code 400}))))
                (when (and (= "true" (u/lower-case-en (str new-value))) (ws.db/any-workspace-exists?))
                  (throw (ex-info (tru "This instance has workspaces of its own, so it can''t be a workspace.")
                                  {:status-code 400})))
                (setting/set-value-of-type! :boolean :workspaces-enabled new-value))
  ;; :on-change gets the raw cached strings ("true"/"false"/nil), not booleans.
  ;; Outside workspace mode a node trusts its cache of the Databases with remappings, and rows may have changed
  ;; while it was in workspace mode. Fires on every node when its settings cache picks up the change.
  :on-change  (fn [old-value new-value]
                (table-remapping/invalidate-database-ids!)
                (when (and (= "true" old-value) (not= "true" new-value))
                  (ws.db/delete-all-table-remappings!))))

(defsetting database-workspace-schema
  (deferred-tru "The schema this database''s transforms write to when `workspaces-enabled` is on. On engines without schemas (MySQL), a database name.")
  :type           :string
  :encryption     :no
  :visibility     :admin
  :export?        false
  :database-local :only)
