(ns metabase.task-history.models.task-run
  "Model for TaskRun - groups related tasks from a single operation (subscription, alert, sync, fingerprint)."
  (:require
   [clojure.tools.logging.impl :as log.impl]
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TaskRun [_model] :task_run)

(doto :model/TaskRun
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

;;; Permissions to read or write TaskRun. Same as TaskHistory - requires superusers or monitoring permission.
(defmethod mi/perms-objects-set :model/TaskRun
  [_task-run _read-or-write]
  #{(if (premium-features/enable-advanced-permissions?)
      (perms/application-perms-path :monitoring)
      "/")})

(def run-types
  "Valid run types."
  #{:subscription :alert :sync :fingerprint})

(def entity-types
  "Valid entity types for task runs."
  #{:database :card :dashboard})

(def ^:private task-run-status #{:started :success :failed})

(defn- assert-task-run-status
  [status]
  (assert (task-run-status (keyword status)) "Invalid task run status"))

(t2/define-after-insert :model/TaskRun
  [task-run]
  (assert-task-run-status (:status task-run))
  task-run)

(t2/define-before-update :model/TaskRun
  [task-run]
  (when (contains? task-run :status)
    (assert-task-run-status (:status task-run)))
  task-run)

(t2/deftransforms :model/TaskRun
  {:run_type    mi/transform-keyword
   :entity_type mi/transform-keyword
   :status      mi/transform-keyword})

(def ^:dynamic *run-id*
  "The ID of the current task run. Set by [[with-task-run]]."
  nil)

(mr/def ::TaskRunInfo
  [:map {:closed true}
   [:run_type                       (into [:enum] run-types)]
   [:entity_type                    (into [:enum] entity-types)]
   [:entity_id                      ms/PositiveInt]
   [:auto-complete {:optional true} [:maybe :boolean]]])

(mu/defn create-task-run! :- ms/PositiveInt
  "Create a new task run record. Returns the run ID."
  [{:keys [run_type entity_type entity_id]} :- ::TaskRunInfo]
  (t2/insert-returning-pk! :model/TaskRun
                           {:run_type    run_type
                            :entity_type entity_type
                            :entity_id   entity_id
                            :status      :started
                            :started_at  (t/instant)}))

(mu/defn complete-task-run!
  "Mark a task run as complete, deriving status from child tasks.
   Must be called manually for async flows, or automatically via [[with-task-run]]."
  [run-id :- ms/PositiveInt]
  (let [task-statuses (t2/select-fn-set :status :model/TaskHistory :run_id run-id)
        status        (if (= #{:success} task-statuses)
                        :success
                        :failed)]
    (t2/update! :model/TaskRun run-id
                {:status   status
                 :ended_at (t/instant)})))

(defn- log-capture-factory [base-factory log-atom]
  (reify log.impl/LoggerFactory
    (name [_] "metabase.task_history")
    (get-logger [_ logger-ns]
      (let [base-logger (log.impl/get-logger base-factory logger-ns)]
        (reify log.impl/Logger
          (enabled? [_ level] (log.impl/enabled? base-logger level))
          (write! [_ level ex msg]
            (swap! log-atom conj {:level level, :msg msg, :ex ex})
            (log.impl/write! base-logger level ex msg)))))))

(defmacro with-task-run
  "Wrap a root flow to group all tasks under a single run.
   `run-info` should contain :run_type, :entity_type, :entity_id.

   For async flows (e.g., async notifications), use :auto-complete false and
   call [[complete-task-run!]] manually when all async work is done. "
  {:style/indent 1}
  [run-info & body]
  `(let [info#          ~run-info
         auto-complete# (get info# :auto-complete true)
         run-id#        (create-task-run! info#)]
     (if auto-complete#
       (try
         (binding [*run-id* run-id#]
           ~@body)
         (finally
           (complete-task-run! run-id#)))
       ;; Async: caller is responsible for calling complete-task-run!
       (binding [*run-id* run-id#]
         ~@body))))
