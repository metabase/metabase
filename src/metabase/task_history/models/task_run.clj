(ns metabase.task-history.models.task-run
  "Model for TaskRun - groups related tasks from a single operation (subscription, alert, sync, fingerprint)."
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.task-history.db :as task-history.db]
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

(def ^:private task-run-status #{:started :success :failed :abandoned})

(defn- assert-task-run-status
  [status]
  (assert (task-run-status (keyword status)) "Invalid task run status"))

(t2/define-before-insert :model/TaskRun
  [task-run]
  (merge {:started_at (mi/now), :updated_at (mi/now)} task-run))

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

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *run*
  "The current task run, set by [[with-task-run]] and [[with-restored-run-id]]: its `:id`, and `:auto-complete?`, true
  when [[with-task-run]] completes the run after its body."
  nil)

(defn current-run-id
  "Returns the current task run ID, or nil when neither [[with-task-run]] nor [[with-restored-run-id]] set a run."
  []
  (:id *run*))

(defn with-run-id-meta
  "Given a map, returns the map with the current run ID attached to metadata.
   Used for propagation of run context across threads (e.g., async notification dispatch)."
  [m]
  (vary-meta m assoc ::run-id (current-run-id)))

(defmacro with-restored-run-id
  "Given a map presumably containing metadata from [[with-run-id-meta]], restores the current run and executes body.
  The restored run is not completed by a [[with-task-run]] on this thread, so [[task-run-work-done!]] completes it."
  [m & body]
  `(binding [*run* (when-let [run-id# (::run-id (meta ~m))]
                     {:id run-id# :auto-complete? false})]
     ~@body))

(mr/def ::TaskRunInfo
  [:map {:closed true}
   [:run_type                         (into [:enum] run-types)]
   [:entity_type                      (into [:enum] entity-types)]
   [:entity_id                        ms/PositiveInt]
   ;; The notification this run is for, when applicable (alerts / subscriptions). Lets the run be
   ;; attributed to the exact notification rather than only to its shared card/dashboard entity.
   [:notification_id {:optional true} [:maybe ms/PositiveInt]]
   [:auto-complete   {:optional true} [:maybe :boolean]]])

(mu/defn create-task-run! :- ms/PositiveInt
  "Create a new task run record. Returns the run ID."
  [{:keys [run_type entity_type entity_id notification_id]} :- ::TaskRunInfo]
  (task-history.db/insert-task-run!
   {:run_type        run_type
    :entity_type     entity_type
    :entity_id       entity_id
    :notification_id notification_id
    :status          :started
    :process_uuid    config/local-process-uuid}))

(mu/defn complete-task-run!
  "Mark a task run as complete, deriving status from child tasks. [[with-task-run]] calls it after its body; for
  `:auto-complete false` runs use [[task-run-work-done!]].
   Idempotent - only completes if status is still :started."
  [run-id :- ms/PositiveInt]
  (let [task-statuses (task-history.db/task-statuses-for-run run-id)
        status        (if (= #{:success} task-statuses)
                        :success
                        :failed)]
    (task-history.db/finish-started-task-run! run-id status (t/instant))))

(defn- run-status-from-tasks
  "The status of a run whose tasks have `task-statuses`: started while any task runs, success when every task
  succeeded, else failed."
  [task-statuses]
  (cond
    (contains? task-statuses :started) :started
    (= #{:success} task-statuses)      :success
    :else                              :failed))

(mu/defn- recompute-task-run-status!
  "Set the status of the run `run-id` from its tasks as they are now. An abandoned run keeps its status.

  The run row stays locked while its tasks are read, so when two pieces of work end at the same time, the second one
  reads the tasks after the first one wrote, and its status is the one that stays."
  [run-id :- ms/PositiveInt]
  (t2/with-transaction [_conn]
    (let [current (task-history.db/lock-task-run-status run-id)]
      (when-not (contains? #{nil :abandoned} current)
        (let [status (run-status-from-tasks (task-history.db/task-statuses-for-run run-id))]
          (when (not= status current)
            (task-history.db/set-task-run-status! run-id status (when-not (= :started status) (t/instant)))))))))

(mu/defn task-run-work-done!
  "Call when one piece of work in the run `run-id` ends, for example one notification send.

  Inside a [[with-task-run]] with `:auto-complete`, that macro completes the run after all of its work, so this does
  nothing. A completion here would fix the run status before the rest of the work ran.

  Otherwise (`:auto-complete false`) the work runs on other threads, and no single place sees it all end. So every
  piece of work calls this, and [[with-task-run]] calls it after its body, and each call sets the run status from the
  tasks as they are now. The run is started while any task runs; the last call sees every task and sets the final
  status."
  [run-id :- ms/PositiveInt]
  (when-not (and (= run-id (:id *run*)) (:auto-complete? *run*))
    (recompute-task-run-status! run-id)))

(defmacro with-task-run
  "Wrap a root flow to group all tasks under a single run.
   `run-info` should contain :run_type, :entity_type, :entity_id.

   If `run-info` is nil or already inside a task run, just executes body without
   creating a new task run (prevents nesting).

   After the body, it completes the run with [[complete-task-run!]]. For async flows (e.g., async notifications), use
   :auto-complete false: then it calls [[task-run-work-done!]] after the body instead, and each piece of async work
   must call [[task-run-work-done!]] when it is done."
  {:style/indent 1}
  [run-info & body]
  `(if (or *run* (nil? ~run-info))
     (do ~@body)
     (let [info#          ~run-info
           auto-complete# (boolean (get info# :auto-complete true))
           run-id#        (create-task-run! info#)]
       (binding [*run* {:id run-id# :auto-complete? auto-complete#}]
         (try
           ~@body
           (finally
             (if auto-complete#
               (complete-task-run! run-id#)
               (task-run-work-done! run-id#))))))))
