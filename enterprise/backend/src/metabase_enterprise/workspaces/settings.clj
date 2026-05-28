(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(def keep-me
  "Marker so callers can `(comment ...keep-me)` to retain the require that registers the settings in this ns."
  nil)

(defn- coerce-database-id-key
  "JSON round-trips through the `instance-workspace` setting return integer
   `Database.id` keys as keywords (e.g. `:1`). Coerce them back to ints."
  [k]
  (cond
    (int? k)     k
    (keyword? k) (parse-long (name k))
    (string? k)  (parse-long k)))

(defsetting instance-workspace
  (deferred-tru "The workspace loaded on this instance. Populated at boot from a config.yml `:workspace` section or at runtime via `POST /api/ee/advanced-config`. `nil` on parent and unconfigured instances. Read by the QP, transform hooks, and the EE `workspace-mode?` predicate via `metabase-enterprise.workspaces.core/instance-workspace`.")
  :type       :json
  :encryption :no
  :feature    :workspaces
  :visibility :internal
  :export?    false
  :audit      :never
  :doc        false
  :getter     (fn []
                (some-> (setting/get-value-of-type :json :instance-workspace)
                        (update :databases #(update-keys % coerce-database-id-key)))))

(defsetting development-instance
  (deferred-tru "Marks this Metabase instance as a development instance that can be attached to a Workspace for testing transforms before syncing changes to production. Implicitly true whenever an `instance-workspace` is loaded.")
  :type       :boolean
  :default    false
  :encryption :no
  :feature    :workspaces
  :visibility :admin
  :export?    false
  :audit      :getter
  :getter     (fn []
                (or (setting/get-value-of-type :boolean :development-instance)
                    (some? (instance-workspace)))))
