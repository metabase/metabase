(ns metabase.task-history.models.task-run
  "Model for TaskRun - groups related tasks from a single operation (subscription, alert, sync, fingerprint)."
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
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

(def ^:private task-run-status #{:started :success :failed :abandoned})

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

(defn current-run-id
  "Returns the current task run ID, or nil if not inside a [[with-task-run]] block."
  []
  *run-id*)

(defn with-run-id-meta
  "Given a map, returns the map with `*run-id*` attached to metadata.
   Used for propagation of run context across threads (e.g., async notification dispatch)."
  [m]
  (vary-meta m assoc ::run-id *run-id*))

(defmacro with-restored-run-id
  "Given a map presumably containing metadata from [[with-run-id-meta]], restores `*run-id*` and executes body."
  [m & body]
  `(binding [*run-id* (::run-id (meta ~m))]
     ~@body))

(mr/def ::TaskRunInfo
  [:map {:closed true}
   [:run_type                       (into [:enum] run-types)]
   [:entity_type                    (into [:enum] entity-types)]
   [:entity_id                      ms/PositiveInt]
   [:auto-complete {:optional true} [:maybe :boolean]]])

(mu/defn create-task-run! :- ms/PositiveInt
  "Create a new task run record. Returns the run ID."
  [{:keys [run_type entity_type entity_id]} :- ::TaskRunInfo]
  (let [now (mi/now)]
    (t2/insert-returning-pk! :model/TaskRun
                             {:run_type     run_type
                              :entity_type  entity_type
                              :entity_id    entity_id
                              :status       :started
                              :started_at   now
                              :updated_at   now
                              :process_uuid config/local-process-uuid})))

(mu/defn complete-task-run!
  "Mark a task run as complete, deriving status from child tasks.
   Must be called manually for async flows, or automatically via [[with-task-run]].
   Idempotent - only completes if status is still :started."
  [run-id :- ms/PositiveInt]
  (let [task-statuses (t2/select-fn-set :status :model/TaskHistory :run_id run-id)
        status        (if (= #{:success} task-statuses)
                        :success
                        :failed)]
    (t2/update! :model/TaskRun {:id run-id :status :started}
                {:status   status
                 :ended_at (t/instant)})))

(defmacro with-task-run
  "Wrap a root flow to group all tasks under a single run.
   `run-info` should contain :run_type, :entity_type, :entity_id.

   If `run-info` is nil or already inside a task run, just executes body without
   creating a new task run (prevents nesting).

   For async flows (e.g., async notifications), use :auto-complete false and
   call [[complete-task-run!]] manually when all async work is done."
  {:style/indent 1}
  [run-info & body]
  `(if (or *run-id* (nil? ~run-info))
     (do ~@body)
     (let [info#          ~run-info
           auto-complete# (get info# :auto-complete true)
           run-id#        (create-task-run! info#)]
       (binding [*run-id* run-id#]
         (if auto-complete#
           (try
             ~@body
             (finally
               (complete-task-run! run-id#)))
           ;; Async: caller is responsible for calling complete-task-run!
           (do ~@body))))))
