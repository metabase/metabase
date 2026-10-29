(ns metabase.task-history.models.task-run
  "Model for TaskRun - groups related tasks from a single operation (subscription, alert, sync, fingerprint)."
  (:require
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.task-history.db :as task-history.db]
   [metabase.util.log :as log]
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

(defonce ^:private run-id->pending-work
  ;; The number of pieces of work of each run with `:auto-complete false` that have not ended yet: the body of
  ;; [[with-task-run]], and each map tagged with [[track-run-work!]]. A run is in this map only while it has such work.
  ;; The queue that holds the work is in this process too, so the count does not need to be in the app DB.
  (atom {}))

(defn- add-pending-work!
  [run-id]
  (swap! run-id->pending-work update run-id (fnil inc 0)))

(defn- end-pending-work!
  "Count one piece of work of the run `run-id` as ended. Returns `:last` when it was the last one, `:more` when the run
  has other work that has not ended, and `:unknown` when the run has no count."
  [run-id]
  (let [[before after] (swap-vals! run-id->pending-work
                                   (fn [counts]
                                     (let [n (dec (get counts run-id 0))]
                                       (if (pos? n)
                                         (assoc counts run-id n)
                                         (dissoc counts run-id)))))]
    (cond
      (not (contains? before run-id)) :unknown
      (contains? after run-id)        :more
      :else                           :last)))

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

(mu/defn- complete-task-run!
  "Mark a task run as complete, deriving status from child tasks. [[with-task-run]] calls it after its body; for
  `:auto-complete false` runs, [[task-run-work-done!]] calls it after the last piece of work.
   Idempotent - only completes if status is still :started."
  [run-id :- ms/PositiveInt]
  (let [task-statuses (task-history.db/task-statuses-for-run run-id)
        status        (if (= #{:success} task-statuses)
                        :success
                        :failed)]
    (task-history.db/finish-started-task-run! run-id status (t/instant))))

(mu/defn- task-run-work-done!
  "Call when one piece of work of the `:auto-complete false` run `run-id` ends: [[with-task-run]] after its body, and
  [[end-run-work!]] for a map from [[track-run-work!]]. The run stays started while it has work that has not
  ended, and the call for its last piece of work completes it with [[complete-task-run!]]. At that point every task of
  the run has ended."
  [run-id :- ms/PositiveInt]
  (case (end-pending-work! run-id)
    :more    nil
    :last    (complete-task-run! run-id)
    :unknown (do
               (log/warnf "Task run %d: a piece of work ended that was not counted, or that ended twice" run-id)
               (complete-task-run! run-id))))

(defn track-run-work!
  "Returns the map `m` with the current run attached to its metadata, so that the run can be restored on another thread
  with [[with-restored-run-id]] (e.g., async notification dispatch).

  When the current run has `:auto-complete false`, the map is also one more piece of work of that run: the run stays
  started until [[end-run-work!]] is called for the map, exactly once. [[with-restored-run-id]] calls it after the
  work."
  [m]
  (let [{:keys [id auto-complete?]} *run*
        pending-work?               (boolean (and id (not auto-complete?)))]
    (when pending-work?
      (add-pending-work! id))
    (vary-meta m assoc ::run-id id ::pending-work? pending-work?)))

(defn end-run-work!
  "Call once for the map `m` from [[track-run-work!]]: after its work ran, or when it will never run, for example
  because a newer map replaced it in a queue. Does nothing when `m` is not a piece of work of its run."
  [m]
  (let [{::keys [run-id pending-work?]} (meta m)]
    (when pending-work?
      (task-run-work-done! run-id))))

(defmacro with-restored-run-id
  "Given a map presumably containing metadata from [[track-run-work!]], restores the current run and executes body,
  then calls [[end-run-work!]] for the map. The restored run counts the work that the body tags with
  [[track-run-work!]] only when the run counted the map itself."
  [m & body]
  `(let [m#                         ~m
         {run-id#        ::run-id
          pending-work?# ::pending-work?} (meta m#)]
     (binding [*run* (when run-id#
                       {:id run-id# :auto-complete? (not pending-work?#)})]
       (try
         ~@body
         (finally
           (end-run-work! m#))))))

(defn do-with-task-run
  "Implementation of [[with-task-run]]."
  [run-info thunk]
  (if (or *run* (nil? run-info))
    (thunk)
    (let [auto-complete (boolean (get run-info :auto-complete true))
          run-id        (create-task-run! run-info)]
      (when-not auto-complete
        (add-pending-work! run-id))
      (binding [*run* {:id run-id :auto-complete? auto-complete}]
        (try
          (thunk)
          (finally
            (if auto-complete
              (complete-task-run! run-id)
              (task-run-work-done! run-id))))))))

(defmacro with-task-run
  "Wrap a root flow to group all tasks under a single run.
   `run-info` should contain :run_type, :entity_type, :entity_id.

   If `run-info` is nil or already inside a task run, just executes body without
   creating a new task run (prevents nesting).

   After the body, it completes the run with [[complete-task-run!]]. For async flows (e.g., async notifications), use
   :auto-complete false: then the body is one piece of work of the run, and each map that carries the run to another
   thread with [[track-run-work!]] is one more. The run completes after the last of them ends."
  {:style/indent 1}
  [run-info & body]
  `(do-with-task-run ~run-info (fn [] ~@body)))
