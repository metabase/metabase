(ns metabase-enterprise.library-branching.tasks
  "The task lifecycle of library branching. A task is a row of the app DB, the record that the UI shows, and a worker
  that runs the operation. Statuses: running and committing are open; successful, failed, cancelled and
  interrupted are ended, and an ended row never changes.

  One task runs at a time: [[start!]] inserts a row, under the cluster lock, only when no open row has a fresh
  heartbeat. An open row with no heartbeat for the time limit is stale, and a reader ends it as interrupted; its
  worker can still wake up and go on. Three rules keep such a worker from an untruthful row:

  - the fence: the commit of an operation runs in [[commit!]], one transaction that locks its own row and commits only
    while the row is running, and ends the row in the same transaction;
  - the commit point: a push moves its row to committing ([[mark-committing!]]) before its remote compare-and-swap,
    and a cancel of a committing row is refused;
  - [[cancel!]] is a compare-and-swap of a running row, under the same row lock as the fence.

  So a successful row had its effect, a cancelled or a failed row had none, an interrupted pull had none, and an
  interrupted push may have landed."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def kinds
  "The operations that run as a task."
  #{"push" "pull" "merge-branch" "deploy" "branch-create" "branch-switch" "settings"})

(def open-statuses
  "The statuses of a task that has not ended."
  #{"running" "committing"})

(def ended-statuses
  "The statuses of a task that ended. An ended row never changes."
  #{"successful" "failed" "cancelled" "interrupted"})

(mr/def ::kind (into [:enum] (sort kinds)))

(mr/def ::status (into [:enum] (sort (into open-statuses ended-statuses))))

(mr/def ::outcome
  [:map {::mr/deliberately-open true, :description "the result of a successful task, such as {:kind \"pulled\" :count 3 :branch \"main\"}"}
   [:kind :string]])

(mr/def ::user
  [:map {:closed true}
   [:id pos-int?]
   [:first_name [:maybe :string]]
   [:last_name [:maybe :string]]
   [:email :string]])

(mr/def ::task
  [:map {:closed true}
   [:id pos-int?]
   [:task_type ::kind]
   [:status ::status]
   [:initiated_by [:maybe pos-int?]]
   [:initiated_by_user [:maybe ::user]]
   [:progress number?]
   [:started_at some?]
   [:last_heartbeat_at some?]
   [:ended_at :any]
   [:outcome [:maybe ::outcome]]
   [:error_message [:maybe :string]]])

(def default-heartbeat-interval-ms
  "The time between two heartbeats of a worker."
  15000)

(def cancelled-message
  "The error message of a cancelled task."
  "Task cancelled")

(def no-result-message
  "The error message of a task whose worker ended with no result."
  "Task ended without recording a result")

(def shutdown-message
  "The error message of a task that the shutdown of its server ended."
  "Interrupted by server shutdown")

(defn- not-yet [f] (throw (ex-info (str "Not implemented yet: " f) {})))

(defn task "Not yet." [_id] (not-yet "task"))
(defn newest-task "Not yet." [] (not-yet "newest-task"))
(defn live-task "Not yet." [] (not-yet "live-task"))
(defn open? "Not yet." [_task] (not-yet "open?"))
(defn stale? "Not yet." [_task] (not-yet "stale?"))
(defn supersede-stale! "Not yet." [] (not-yet "supersede-stale!"))
(defn start! "Not yet." [_kind _user-id] (not-yet "start!"))
(defn succeed! "Not yet." [_id _outcome] (not-yet "succeed!"))
(defn fail! "Not yet." [_id _message] (not-yet "fail!"))
(defn interrupt! "Not yet." [_id _message] (not-yet "interrupt!"))
(defn cancel! "Not yet." [_id] (not-yet "cancel!"))
(defn mark-committing! "Not yet." [_id] (not-yet "mark-committing!"))
(defn fence "Not yet." [_id] (not-yet "fence"))
(defn commit! "Not yet." [_id _f] (not-yet "commit!"))
(defn record! "Not yet." [_id _f] (not-yet "record!"))
(defn report-progress! "Not yet." [_id _fraction] (not-yet "report-progress!"))
(defn progress-reporter "Not yet." [_id & _opts] (not-yet "progress-reporter"))
(defn phase "Not yet." [_report _lo _hi] (not-yet "phase"))
(defn running-task-ids "Not yet." [] (not-yet "running-task-ids"))
(defn heartbeat! "Not yet." [_id] (not-yet "heartbeat!"))
(defn start-heartbeat! "Not yet." [_id & _more] (not-yet "start-heartbeat!"))
(defn run-task! "Not yet." [_id _f & _opts] (not-yet "run-task!"))
(defn submit! "Not yet." [_kind _user-id _f & _opts] (not-yet "submit!"))
(defn interrupt-running-tasks! "Not yet." [] (not-yet "interrupt-running-tasks!"))
