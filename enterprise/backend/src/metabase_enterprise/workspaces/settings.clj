(ns metabase-enterprise.workspaces.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(setting/defsetting database-enable-workspaces
  (deferred-tru "Whether the database has workspaces enabled")
  :default          false
  :feature          :table-data-editing
  :driver-feature   :actions/data-editing
  :enabled-for-db? (fn [db]
                     (setting/custom-disabled-reasons!
                      (if-let [permission-status (:workspace_permissions_status db)]
                        (when-let [error (:error permission-status)]
                          [{:type    :error
                            :key     :workspaces/permisions-missing
                            ;; TODO (Ngoc 2026-01-20) localize error message
                            :message error}])
                        [{:type    :error
                          :key     :workspaces/permisisons-unchecked
                          :message (deferred-tru "Workspace connection must be tested explicitly.")}])))
  :type             :boolean
  :visibility       :public
  :database-local   :only
  :export?          true)
