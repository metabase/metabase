(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
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
  (deferred-tru "Whether this instance is a workspace: transforms on a database with a `database-workspace-schema` write there instead of to production, and later reads of their output follow. Not the per-database switch a parent uses to offer workspaces (`database-enable-workspaces`). Turning it off deletes every table remapping.")
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    false
  :audit      :getter
  :setter     (fn [new-value]
                (when (and (= "true" (u/lower-case-en (str new-value))) (ws.db/any-workspace-exists?))
                  (throw (ex-info (tru "This instance has workspaces of its own, so it can''t be a workspace.")
                                  {:status-code 400})))
                (setting/set-value-of-type! :boolean :workspaces-enabled new-value))
  ;; :on-change gets the raw cached strings ("true"/"false"/nil), not booleans.
  :on-change  (fn [old-value new-value]
                (when (and (= "true" old-value) (not= "true" new-value))
                  (ws.db/delete-all-table-remappings!))))

(defsetting database-workspace-schema
  (deferred-tru "The schema this database''s transforms write to when `workspaces-enabled` is on. On engines without schemas (MySQL), a database name.")
  :type           :string
  :encryption     :no
  :visibility     :admin
  :export?        false
  :database-local :only)

(defsetting workspace-id
  (deferred-tru "The id of the parent''s workspace this instance serves. Informational: workspace behavior does not read it.")
  :type       :integer
  :visibility :admin
  :export?    false)

(defsetting workspace-parent-url
  (deferred-tru "The site URL of the parent instance whose workspace this instance serves. Informational: workspace behavior does not read it.")
  :type       :string
  :encryption :no
  :visibility :admin
  :export?    false)
