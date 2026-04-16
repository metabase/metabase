(ns metabase-enterprise.workspaces.models.workspace-log
  (:require
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [deferred-tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceLog [_model] :workspace_log)

(doto :model/WorkspaceLog
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/WorkspaceLog
  {:task   mi/transform-keyword
   :status mi/transform-keyword})

(defn- task->description
  "Return a human-readable description for a workspace task."
  [task]
  (case task
    :workspace-setup    (deferred-tru "Setting up the workspace")
    :database-isolation (deferred-tru "Provisioning database isolation")
    :mirror-entities    (deferred-tru "Mirroring entities")
    :grant-read-access  (deferred-tru "Granting permissions")
    (name task)))

(t2/define-after-select :model/WorkspaceLog
  [{:keys [task] :as log}]
  (assoc log :description (task->description task)))

(defn start!
  "Create a log entry for a workspace setup task. Returns the created log."
  [workspace-id task]
  (t2/insert-returning-instance! :model/WorkspaceLog
                                 {:workspace_id workspace-id
                                  :task         task
                                  :started_at   (t/offset-date-time)
                                  :status       :started}))

(defn- complete!
  [status log-id & [message]]
  (assert (#{:success :failure} status) "It can only be either success or failure")
  (let [data (cond-> {:completed_at (t/offset-date-time)
                      :status       status}
               message (assoc :message message))]
    (t2/update! :model/WorkspaceLog log-id data)))

(defn success!
  "Task was completed successfully"
  [log-id & [message]]
  (complete! :success log-id message))

(defn failure!
  "Task has failed"
  [log-id & [message]]
  (complete! :failure log-id message))

(defmacro track!
  "Wrap body with automatic logging: starts a log entry, marks success on completion, failure on exception."
  [workspace-id task & body]
  `(let [log# (start! ~workspace-id ~task)]
     (try
       (let [result# (do ~@body)]
         (success! (:id log#))
         result#)
       (catch Exception e#
         (failure! (:id log#) (ex-message e#))
         (throw e#)))))
