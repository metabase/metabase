(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.workspaces.core :as-alias ws.oss]))

(mr/def ::raw-instance-workspace-config
  "On-disk shape of the `instance-workspace` setting: `:databases` keyed by db
   name so the value matches YAML and is portable across instances. Keys may be
   strings or keywords (YAML keywordizes, raw JSON keeps strings). The id-keyed
   form consumers use is [[metabase.workspaces.core/workspace-instance-config]]."
  [:map
   [:name      [:string {:min 1}]]
   [:databases [:map-of
                [:or :string :keyword]
                ::ws.oss/workspace-database-config]]])

(defn- validate-instance-workspace!
  "Reject malformed setting values before they reach the store, so writes from
   env, the config file, or the settings API all fail loudly on bad input."
  [config]
  (when (some? config)
    (mu/validate-throw ::raw-instance-workspace-config config))
  config)

(defsetting instance-workspace
  (deferred-tru "The workspace loaded on this instance, in its name-keyed YAML shape. `nil` on parent and unconfigured instances.")
  :type               :json
  :encryption         :no
  :feature            :workspaces
  :visibility         :admin
  :export?            false
  :audit              :never
  :can-read-from-env? true
  :setter             (fn [new-value]
                        (setting/set-value-of-type!
                         :json :instance-workspace
                         (validate-instance-workspace! new-value))))

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
