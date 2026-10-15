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
   [java-time.api :as t]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as mdb]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.util.concurrent Future TimeUnit TimeoutException)))

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

(defn- now [] (t/offset-date-time))

(defn time-limit-ms
  "The time a worker may show no sign of life before its open row is stale: the setting
  `remote-sync-task-time-limit-ms`."
  []
  (setting/get :remote-sync-task-time-limit-ms))

(defn hard-time-limit-ms
  "The time a worker may run before it is stopped and its task fails: ten times [[time-limit-ms]]."
  []
  (* 10 (time-limit-ms)))

(defn- cutoff []
  (t/minus (now) (t/millis (time-limit-ms))))

(defn- interrupted-message []
  (let [minutes (max 1 (quot (time-limit-ms) 60000))]
    (format "Sync was interrupted: the server stopped responding for %d minute%s (it may have restarted)"
            minutes (if (= 1 minutes) "" "s"))))

;;; ------------------------------------------------------ Rows ------------------------------------------------------

(defn- present
  "The task of `row` with its initiating user, as [[::task]]."
  [row users]
  (when row
    (-> (into {} row)
        (update :outcome #(some-> % json/decode+kw))
        (assoc :initiated_by_user (get users (:initiated_by row))))))

(defn- present-rows [rows]
  (let [users (into {}
                    (map (juxt :id #(select-keys % [:id :first_name :last_name :email])))
                    (library-branching.db/users-by-id (vec (distinct (keep :initiated_by rows)))))]
    (mapv #(present % users) rows)))

(mu/defn task :- [:maybe ::task]
  "The task `id`, or nil."
  [id :- pos-int?]
  (first (present-rows (keep identity [(library-branching.db/task-row id)]))))

(mu/defn newest-task :- [:maybe ::task]
  "The newest task, open or ended, or nil when there is none."
  []
  (first (present-rows (keep identity [(library-branching.db/newest-task-row)]))))

(mu/defn live-task :- [:maybe ::task]
  "The newest open task whose worker showed a sign of life within the time limit, or nil."
  []
  (first (present-rows (keep identity [(library-branching.db/newest-live-task-row open-statuses (cutoff))]))))

(defn open?
  "True iff `task` has not ended."
  [task]
  (contains? open-statuses (:status task)))

(defn stale?
  "True iff `task` is open and its worker showed no sign of life within the time limit."
  [task]
  (and (open? task) (t/before? (t/offset-date-time (:last_heartbeat_at task)) (cutoff))))

(mu/defn supersede-stale! :- [:sequential pos-int?]
  "Ends every stale open task as interrupted, with a message that names the time limit. A task with a fresh heartbeat
  stays. Returns the ids of the tasks that it ended."
  []
  (let [ids (library-branching.db/end-stale-task-rows! open-statuses
                                                       (cutoff)
                                                       {:status        "interrupted"
                                                        :ended_at      (now)
                                                        :error_message (interrupted-message)})]
    (when (seq ids)
      (log/warnf "Library branching superseded the stale tasks %s" ids))
    ids))

(mu/defn start! :- ::task
  "Starts a task of `kind` for the user `user-id` (nil: the system starts it), under the cluster lock: it ends every
  stale open task as interrupted, then inserts a running task, and returns it. Throws ex-info with `:status-code` 400,
  and the live task under `:task`, when an open task has a fresh heartbeat; then nothing changes."
  [kind    :- ::kind
   user-id :- [:maybe pos-int?]]
  (cluster-lock/with-cluster-lock ::task
    (when-let [live (live-task)]
      (throw (ex-info (tru "Library branching task in progress")
                      {:status-code 400 :type ::in-progress :task live})))
    (supersede-stale!)
    (let [t (now)]
      (task (library-branching.db/insert-task! {:task_type         kind
                                                :status            "running"
                                                :initiated_by      user-id
                                                :progress          0.0
                                                :started_at        t
                                                :last_heartbeat_at t})))))

(defn- end-row!
  "Ends task `id` with `status` and the columns `changes` iff its status is in `from`. True iff it ended it."
  [id from status changes]
  (= 1 (library-branching.db/update-task-row! id from (merge {:status status :ended_at (now)} changes))))

(mu/defn succeed! :- :boolean
  "Ends task `id` as successful with `outcome` iff it is open. True iff it ended it."
  [id      :- pos-int?
   outcome :- [:maybe ::outcome]]
  (end-row! id open-statuses "successful" {:outcome (some-> outcome json/encode) :progress 1.0}))

(mu/defn fail! :- :boolean
  "Ends task `id` with the error message `message` iff it is open: a running task as failed, a committing task as
  interrupted, because its push may have landed. True iff it ended it. Not built yet: the outcome."
  ([id      :- pos-int?
    message :- :string]
   (or (end-row! id #{"running"} "failed" {:error_message message})
       (end-row! id #{"committing"} "interrupted" {:error_message message})))
  ([id       :- pos-int?
    message  :- :string
    _outcome :- [:maybe ::outcome]]
   (fail! id message)))

(mu/defn fail-committing! :- :boolean
  "Ends task `id` as failed with the error message `message` iff it is committing: for a push past its commit point
  whose remote compare-and-swap refused, so the push did not land. True iff it ended it."
  [id      :- pos-int?
   message :- :string]
  (end-row! id #{"committing"} "failed" {:error_message message}))

(mu/defn interrupt! :- :boolean
  "Ends task `id` as interrupted with the error message `message` iff it is open. True iff it ended it."
  [id      :- pos-int?
   message :- :string]
  (end-row! id open-statuses "interrupted" {:error_message message}))

(mu/defn cancel! :- [:or [:map [:ok ::task]] [:map [:refused [:maybe ::status]]]]
  "Cancels task `id`: a compare-and-swap of its row from running to cancelled, under the row lock that [[commit!]]
  holds. Returns `{:ok task}` with the cancelled task, or `{:refused status}` and changes nothing when the task is not
  running (status nil: there is no task `id`). A committing task is refused: its push is past the commit point."
  [id :- pos-int?]
  (if (end-row! id #{"running"} "cancelled" {:error_message cancelled-message})
    {:ok (task id)}
    {:refused (:status (task id))}))

;;; ------------------------------------------------- Commit point --------------------------------------------------

(mu/defn mark-committing! :- [:or [:= :ok] [:map [:fenced [:maybe ::status]]]]
  "The commit point of a push: moves task `id` from running to committing by compare-and-swap. Returns :ok, or
  `{:fenced status}` and changes nothing when the task is not running; then the push stops before its remote
  compare-and-swap."
  [id :- pos-int?]
  (if (= 1 (library-branching.db/update-task-row! id #{"running"} {:status "committing" :last_heartbeat_at (now)}))
    :ok
    {:fenced (:status (task id))}))

(mu/defn fence :- [:maybe [:map [:fenced [:maybe ::status]]]]
  "The fence check, for the current transaction: locks the row of task `id` until the transaction ends, and returns
  nil iff the task is running, else `{:fenced status}`. Throws when no transaction is open."
  [id :- pos-int?]
  (when-not (mdb/in-transaction?)
    (throw (ex-info "The fence of a task needs an open transaction." {:task-id id})))
  (let [status (:status (library-branching.db/lock-task-row id))]
    (when-not (= "running" status)
      {:fenced status})))

(defn commit!
  "Runs `f`, a function of no arguments, as the commit of task `id`, in one transaction that first runs [[fence]].
  When the task is not running, returns `{:fenced status}` and does not call `f`. A result of `f` with the key `:ok`
  ends the task as successful, with the outcome `(:outcome result)`, in the same transaction, and is returned. Any
  other result rolls the writes of `f` back and is returned. A throw of `f` rolls them back and propagates."
  [id f]
  (try
    (t2/with-transaction [_]
      (or (fence id)
          (let [result (f)]
            (if (and (map? result) (contains? result :ok))
              (do (succeed! id (:outcome result))
                  result)
              (throw (ex-info "Rollback of a task commit" {::rollback result}))))))
    (catch ExceptionInfo e
      (if (contains? (ex-data e) ::rollback)
        (::rollback (ex-data e))
        (throw e)))))

(defn record!
  "Runs `f`, a function of no arguments, as the record step of a push past its commit point: in one transaction, it
  locks the row of task `id`, calls `f`, and ends the task as successful with the outcome `(:outcome result)` iff it
  is still open. The writes of `f` commit whatever the status of the task: the push landed. Returns the result of
  `f`."
  [id f]
  (t2/with-transaction [_]
    (library-branching.db/lock-task-row id)
    (let [result (f)]
      (succeed! id (when (map? result) (:outcome result)))
      result)))

;;; ---------------------------------------------------- Progress ---------------------------------------------------

(mu/defn report-progress! :- :nil
  "Writes the progress `fraction` of task `id`, which is also a sign of life. Throws ex-info of type ::stopped, and
  writes nothing, when the task is not open (a cancel or a supersede ended it): the worker stops at that step."
  [id       :- pos-int?
   fraction :- number?]
  (when-not (= 1 (library-branching.db/update-task-row! id open-statuses {:progress          (double fraction)
                                                                          :last_heartbeat_at (now)}))
    (throw (ex-info (tru "The library branching task ended, so its worker stops.")
                    {:type ::stopped :task-id id :status (:status (task id))})))
  nil)

(defn progress-reporter
  "A function `(report fraction)` or `(report fraction {:force? true})` for task `id`. It clamps `fraction` to [0, 1],
  ignores a fraction below the last one that it wrote, and writes at most once per throttle window, except a forced
  report (a checkpoint). A write is [[report-progress!]], so a report on an ended task throws.

  `opts`: `:throttle-ms` (default 10000), `:now-fn` (milliseconds, default the system clock), `:write-fn` (a function
  of the fraction, default [[report-progress!]] of `id`)."
  ([id] (progress-reporter id nil))
  ([id {:keys [throttle-ms now-fn write-fn] :or {throttle-ms 10000}}]
   (let [now-fn   (or now-fn #(System/currentTimeMillis))
         write-fn (or write-fn #(report-progress! id %))
         last     (volatile! nil)]
     (fn report
       ([fraction] (report fraction nil))
       ([fraction {:keys [force?]}]
        (let [f              (-> (double fraction) (max 0.0) (min 1.0))
              ms             (now-fn)
              [last-ms last-f] @last]
          (when (and (or (nil? last-f) (>= f last-f))
                     (or force? (nil? last-ms) (>= (- ms last-ms) throttle-ms)))
            (vreset! last [ms f])
            (write-fn f))))))))

(defn phase
  "A function `(step done total)` that reports, through `report`, the progress of one phase of a task as a fraction
  in [`lo`, `hi`]: `lo` plus the share `done / total` of the band. A phase with no total (`total` nil or not
  positive) reports `lo`, a sign of life."
  [report lo hi]
  (fn [done total]
    (report (if (and (number? total) (pos? total))
              (+ lo (* (- hi lo) (min 1.0 (max 0.0 (/ (double done) total)))))
              lo))))

;;; ----------------------------------------------------- Workers ---------------------------------------------------

(defonce ^:private running-ids
  (atom #{}))

(defn running-task-ids
  "The ids of the tasks whose worker runs in this JVM."
  []
  @running-ids)

(mu/defn heartbeat! :- :boolean
  "Writes the heartbeat of task `id` iff it is open. True iff it wrote it."
  [id :- pos-int?]
  (= 1 (library-branching.db/update-task-row! id open-statuses {:last_heartbeat_at (now)})))

(defn start-heartbeat!
  "Calls `beat` (default [[heartbeat!]] of task `id`) every `interval-ms` (default [[default-heartbeat-interval-ms]])
  in a virtual thread, with no binding of the calling thread, so the beat uses a connection of its own. A throw of
  `beat` is logged, and the beats go on. Returns a function of no arguments that stops the beats."
  ([id] (start-heartbeat! id default-heartbeat-interval-ms))
  ([id interval-ms] (start-heartbeat! id interval-ms #(heartbeat! id)))
  ([id interval-ms beat]
   (let [stop (promise)]
     (u.jvm/run-in-virtual-thread
      (fn []
        (loop []
          (when (= ::tick (deref stop interval-ms ::tick))
            (try
              (beat)
              (catch Throwable e
                (log/debugf e "The heartbeat of library branching task %d failed" id)))
            (recur)))))
     (fn stop-heartbeat! [] (deliver stop ::stop) nil))))

(defn- throwable-message [^Throwable e]
  (or (not-empty (ex-message e)) (.getName (class e))))

(defn- ensure-ended!
  "Ends task `id` as failed when it is still open after its worker. Never throws."
  [id]
  (try
    (when (fail! id no-result-message)
      (log/warnf "Library branching task %d ended without recording a result" id))
    (catch Throwable e
      (log/errorf e "Library branching could not end task %d" id))))

(defn run-task!
  "Runs `f` as the worker of the open task `id`, on this thread, and returns the task at its end. `(f id)` returns
  `{:outcome o}` for a success, or `{:error message}` for a failure; a throw is a failure with the message of the
  throwable, or its class name when it has none. The result ends the task iff it is still open: a result never
  changes an ended task (a cancel, a supersede, or a [[commit!]] ended it).

  While `f` runs, a heartbeat runs for the task, and `id` is in [[running-task-ids]]. On every exit the heartbeat
  stops, and a task that is still open ends as failed with [[no-result-message]].

  `opts`: `:on-success`, a function of the id and the result that runs after the task ended as successful; a throw of
  it is logged, and the task stays successful. `:heartbeat-ms`, the time between two heartbeats."
  [id f & {:keys [on-success heartbeat-ms] :or {heartbeat-ms default-heartbeat-interval-ms}}]
  (let [stop-heartbeat! (start-heartbeat! id heartbeat-ms)]
    (swap! running-ids conj id)
    (try
      (let [result (try
                     (f id)
                     (catch Throwable e
                       (if (= ::stopped (:type (ex-data e)))
                         (log/infof "Library branching task %d stopped: it ended during its work" id)
                         (log/errorf e "Library branching task %d failed" id))
                       {:error (throwable-message e)}))]
        (if (contains? result :error)
          (fail! id (str (:error result)))
          (succeed! id (:outcome result)))
        (when (and on-success (= "successful" (:status (task id))))
          (try
            (on-success id result)
            (catch Throwable e
              (log/errorf e "The success hook of library branching task %d failed" id)))))
      (catch Throwable e
        (log/errorf e "The bookkeeping of library branching task %d failed" id))
      (finally
        (stop-heartbeat!)
        (swap! running-ids disj id)
        (ensure-ended! id)))
    (task id)))

(defn- timeout-message [ms]
  (str "Task stopped: it ran for longer than its time limit of " (u/format-milliseconds ms)))

(defn submit!
  "Starts a task of `kind` for the user `user-id` with [[start!]], then runs `f` as its worker with [[run-task!]] and
  `opts` in a virtual thread. Returns the new task at once. Throws as [[start!]] does.

  A worker that runs for longer than `(:timeout-ms opts)` (default [[hard-time-limit-ms]]) is interrupted, and its
  task, when still open, fails with a message that names the time limit."
  [kind user-id f & {:keys [timeout-ms] :as opts}]
  (let [{:keys [id] :as started} (start! kind user-id)
        timeout-ms               (or timeout-ms (hard-time-limit-ms))
        ^Future worker           (u.jvm/in-virtual-thread*
                                  (run-task! id f (dissoc opts :timeout-ms)))]
    (u.jvm/in-virtual-thread*
     (try
       (.get worker timeout-ms TimeUnit/MILLISECONDS)
       (catch TimeoutException _
         ;; The task ends before the interrupt, so the error of the interrupted worker does not replace this message.
         (when (fail! id (timeout-message timeout-ms))
           (log/warnf "Library branching task %d ran for longer than %d ms, so it was stopped" id timeout-ms))
         (.cancel worker true))
       (catch Throwable _
         ;; run-task! logs the failures of the worker
         nil)))
    started))

(defn interrupt-running-tasks!
  "Ends each open task in [[running-task-ids]] as interrupted with [[shutdown-message]]: their workers die with this
  JVM. Tasks of other JVMs stay. Never throws."
  []
  (doseq [id (running-task-ids)]
    (try
      (when (interrupt! id shutdown-message)
        (log/infof "Library branching task %d: %s" id shutdown-message))
      (catch Throwable e
        (log/errorf e "Library branching could not end task %d" id)))))
