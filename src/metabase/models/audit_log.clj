(ns ^{:added "0.47.0"}
 metabase.models.audit_log
  "Model defenition for the Metabase Audit Log, which tracks (almost) all actions taken by users across the Metabase
  app. This is a distinct from the Activity and View Log models, which predate this namespace, and which power specific
  API endpoints used for in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as m]
   [toucan2.core :as t2]))

(m/defmethod t2/table-name :m/audit-log
  [_model]
  :audit_log)

(defmulti model-details
  "Returns a map with data about an entity that should be included in the `details` column of the Audit Log."
  {:arglists '([model entity event-type])}
  mi/dispatch-on-model)

(defmethod model-details :default
  [_model _entity _event-type]
  {})

#_(defn- pre-insert [activity]
    (let [defaults {:timestamp :%now
                    :details   {}}]
      (merge defaults activity)))

#_(mi/define-methods
    AuditLog
    {:types      (constantly {:details :json, :topic :keyword})
     :pre-insert pre-insert})
