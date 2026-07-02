(ns metabase.transforms.jobs
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.set :as ordered-set]
   [metabase.channel.urls :as urls]
   [metabase.events.core :as events]
   [metabase.revisions.core :as revisions]
   [metabase.run-tracking.core :as rt]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.freshness :as freshness]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.models.job-run :as transforms.job-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.transforms.usage :as transforms.usage]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private transform-job-heartbeat-stale-minutes
  "A job run whose coordinator hasn't heartbeat in this many minutes is presumed dead and reaped."
  5)

(def ^:private transform-worker-grace-ms
  "Slack beyond the transform run timeout before the coordinator interrupts a worker that ignored its
  own timeout."
  (* transform-job-heartbeat-stale-minutes 60 1000))

(defn- next-transform [ordering transforms-by-id complete]
  (-> (transforms-base.ordering/available-transforms ordering #{} complete)
      first
      transforms-by-id))

(defn- sorted-ordering [ordering transforms-by-id]
  (let [get-created-at (comp :created_at transforms-by-id)]
    (into (sorted-map-by (fn [transform-id-1 transform-id-2]
                           ;; compare based on created_at and id.  created_at should generally be unique, so id should
                           ;; basically never be used, but we don't want to forget about transforms if we somehow end
                           ;; up with multiple with the same created_at.
                           (compare [(get-created-at transform-id-1)
                                     transform-id-1]
                                    [(get-created-at transform-id-2)
                                     transform-id-2])))
          ordering)))

(defn- get-plan [transform-ids]
  (tracing/with-span :tasks "task.transform.plan" {:transform/count (count transform-ids)}
    (let [all-transforms (t2/select [:model/Transform :id :target :target_table_id :created_at :table_dependencies])
          ;; Walk only the dependency closure of the transforms we're asked to run.
          ;; `table-dependencies` (and the QP preprocessing it triggers) is therefore called
          ;; only on transforms in that closure — never on unrelated transforms elsewhere in
          ;; the system. This is what prevents a single broken transform (e.g. one on a
          ;; routing-enabled database) from poisoning the scheduler when no job has asked for it.
          {:keys [dependencies not-found failed uncached]}
          (transforms-base.ordering/transform-ordering transform-ids all-transforms)]
      (when (seq not-found)
        (log/warnf "transform-ordering: %d scheduled id(s) not found in transforms (likely deleted between scheduling and lookup): %s"
                   (count not-found) (pr-str (sort not-found))))
      (when (seq failed)
        (log/warnf "transform-ordering: %d transform(s) failed dep extraction; treated as leaves: %s"
                   (count failed) (pr-str (sort failed))))
      ;; Lazily backfill the table_dependencies column for any closure transform we had to compute live.
      (transforms-base.ordering/persist-table-dependencies! uncached)
      ;; Fetch full rows only for the closure, which is what callers actually consume.
      (let [transforms-by-id (if (seq dependencies)
                               (u/index-by :id (t2/select :model/Transform :id [:in (keys dependencies)]))
                               {})
            sorted-ord       (sorted-ordering dependencies transforms-by-id)]
        (when-let [cycle (transforms-base.ordering/find-cycle sorted-ord)]
          (let [id->name (into {} (map (juxt :id :name)) (vals transforms-by-id))]
            (throw (ex-info (str "Cyclic transform definitions detected: "
                                 (str/join " → " (map id->name cycle)))
                            {:cycle cycle}))))
        (loop [complete (ordered-set/ordered-set)]
          (if-let [current-transform (next-transform sorted-ord transforms-by-id complete)]
            (recur (conj complete (:id current-transform)))
            {:order (map transforms-by-id complete)
             :deps  dependencies}))))))

(defn- wait-for-transform-slot!
  "Poll until no active run exists for `transform-id`, up to `timeout-ms`."
  [transform-id timer timeout-ms]
  (loop []
    (cond
      (not (transform-run/running-run-for-transform-id transform-id)) true
      (>= (u/since-ms timer) timeout-ms)                              false
      :else (do (Thread/sleep 2000) (recur)))))

(defn- run-transform! [run-id run-method user-id started-run-id {transform-id :id :as transform}]
  (cond
    (not (transforms.u/check-feature-enabled transform))
    (log/warnf "Skip running transform %d due to lacking premium features" transform-id)

    (transforms.usage/transform-locked? transform)
    (log/warnf "Skip running transform %d due to locked meter (trial quota exhausted)" transform-id)

    :else
    (tracing/with-span :tasks "task.transform.execute" {:transform/id   transform-id
                                                        :transform/name (:name transform)}
      (let [timer      (u/start-timer)
            timeout-ms (u/minutes->ms (transforms.settings/transform-timeout))]
        (when (transform-run/running-run-for-transform-id transform-id)
          (log/warn "Transform" (pr-str transform-id) "already running, waiting for slot"))
        (loop []
          (if-not (wait-for-transform-slot! transform-id timer timeout-ms)
            (throw (ex-info (format "Transform %s skipped: another active run held the slot for over %d minute(s)"
                                    (pr-str transform-id) (transforms.settings/transform-timeout))
                            {:transform-id transform-id :error :already-running-timeout}))
            (let [result (try
                           (log/info "Executing job transform" (pr-str transform-id))
                           (transforms.execute/execute! transform {:run-method run-method
                                                                   :user-id    user-id
                                                                   :job-run-id run-id
                                                                   ;; lets the coordinator cancel exactly the run
                                                                   ;; this worker started (see [[cancel-worker!]])
                                                                   :on-start   #(deliver started-run-id %)})
                           :ok
                           (catch Exception e
                             ;; Raced with another starter that won the is_active slot; wait again.
                             (if (= :already-running (:error (ex-data e)))
                               :already-running
                               (throw e))))]
              (when (= :already-running result)
                (recur))))))
      (transforms.job-run/add-run-activity! run-id))))

(defn- lane-for
  "Lane a transform runs in: `:py` for python transforms (single-slot), `:sql` otherwise."
  [t]
  (if (transforms-base.u/python-transform? t) :py :sql))

(defn- busy?
  "True while any transform is still in flight in either lane."
  [{:keys [in-flight]}]
  (some seq (vals in-flight)))

(defn- submit-transform!
  "Run `transform` on its own thread; returns a future yielding a `::status` completion map.
  `started-run-id` is a promise the worker delivers its transform run id to once `execute!` has
  created it — at most once, since the `:already-running` retry only re-enters after a failed
  start — so [[cancel-worker!]] can target exactly that run."
  [run-id run-method user-id started-run-id transform]
  (future
    (try
      (run-transform! run-id run-method user-id started-run-id transform)
      {::status :succeeded ::transform transform}
      (catch Throwable t
        (log/errorf t "Transform %s in run %s failed" (pr-str (:id transform)) (pr-str run-id))
        {::status    :failed
         ::transform transform
         ::message   (or (ex-message t) (str t))
         ::throwable t}))))

(defn- transform-target-key
  "A coarse identity for a transform's output table, used to keep two transforms that write the
  same target table from being dispatched concurrently. Returns nil when the transform has no
  resolved target (in which case it isn't subject to the co-writer guard)."
  [transform]
  (when-let [{:keys [database schema name]} (:target transform)]
    [database schema name]))

(defn- dispatch-ready!
  "Submit every transform whose deps have all succeeded and whose lane has a free slot, recording the
  transitive cascade of dep-failures along the way. Returns the updated state."
  [st {:keys [plan deps lanes run-id run-method user-id]}]
  (reduce
   (fn [{:keys [succeeded failed in-flight-targets] :as st} t]
     (let [id            (:id t)
           dep-ids       (get deps id)
           lane-key      (lane-for t)
           in-flight-now (get-in st [:in-flight lane-key])
           tkey          (transform-target-key t)]
       (cond
         (or (succeeded id) (failed id) (in-flight-now id))
         st

         (some failed dep-ids)
         (-> st
             (update :failed conj id)
             (update :failures conj
                     {::transform t
                      ::message (i18n/trs "Failed to run because one or more of the transforms it depends on failed.")}))

         ;; Defer if another in-flight transform is already writing this target table.
         ;; `transform-ordering` builds DAG edges from table *reads*, not co-*writes*, so two
         ;; transforms sharing a target are independent in the DAG and would otherwise dispatch
         ;; concurrently — producing nondeterministic DDL. Retried on a later pass once the in-flight
         ;; writer completes (something is always in-flight while a target is held).
         (and tkey (contains? in-flight-targets tkey))
         st

         (and (every? succeeded dep-ids)
              (< (count in-flight-now) (lanes lane-key)))
         (let [started-run-id (promise)
               fut            (submit-transform! run-id run-method user-id started-run-id t)]
           (cond-> (assoc-in st [:in-flight lane-key id]
                             {:future         fut
                              :timer          (u/start-timer)
                              :tkey           tkey
                              :transform      t
                              :started-run-id started-run-id})
             tkey (update :in-flight-targets conj tkey)))

         :else st)))
   st
   plan))

(defn- cancel-worker!
  "Stop an in-flight worker: signal cooperative cancelation for the run it started, then interrupt
  its thread."
  [{:keys [started-run-id] fut :future}]
  (when-let [run-id (deref started-run-id 0 nil)]
    (canceling/chan-signal-cancel! run-id))
  (future-cancel fut))

(defn- sweep-workers!
  "Fold finished workers into the state; cancel, interrupt, and fail workers that have outrun
  `timeout-ms` — the hard backstop for a worker that ignored its own (query/cancel) timeout."
  [st timeout-ms]
  (reduce-kv
   (fn [st lane-key workers]
     (reduce-kv
      (fn [st id {:keys [timer tkey transform] fut :future :as worker}]
        (let [freed (cond-> (update-in st [:in-flight lane-key] dissoc id)
                      tkey (update :in-flight-targets disj tkey))]
          (cond
            (future-done? fut)
            (let [{::keys [status] :as completion} @fut]
              (if (= status :succeeded)
                (update freed :succeeded conj id)
                ;; preserve the worker's failure context (::message / ::throwable)
                (-> freed
                    (update :failed conj id)
                    (update :failures conj (dissoc completion ::status)))))

            (>= (u/since-ms timer) timeout-ms)
            (do (log/warnf "Transform %s exceeded its deadline; canceling its worker" (pr-str id))
                (cancel-worker! worker)
                (-> freed
                    (update :failed conj id)
                    (update :failures conj
                            {::transform transform
                             ::message   (i18n/trs "Transform did not complete within the timeout and was interrupted.")})))

            :else st)))
      st
      workers))
   st
   (:in-flight st)))

(defn- cancel-in-flight!
  "Best-effort cancel + interrupt of every in-flight worker."
  [st]
  (doseq [workers (vals (:in-flight st))
          [id worker] workers]
    (try
      (cancel-worker! worker)
      (catch Throwable t
        (log/warnf t "Error canceling in-flight worker for transform %s" (pr-str id))))))

(defonce ^:private active-runs
  ;; job-run-id -> promise, delivered once the run is found terminated externally (e.g. reaped)
  (atom {}))

(defn- heartbeat-and-reconcile-runs!
  "Stamp a heartbeat on every job run this process is coordinating, then deliver the `gone` promise
  of any that another path (reaper, force-fail) already terminated, so its coordinator aborts."
  []
  (rt/heartbeat-and-reconcile! {:model      :model/TransformJobRun
                                :active     [:= :is_active true]
                                :ids        (keys @active-runs)
                                :heartbeat! transforms.job-run/heartbeat-runs!
                                :on-gone    (fn [run-id]
                                              (some-> (get @active-runs run-id) (deliver true)))}))

(defn- run-coordinator-loop!
  "Dispatch ready transforms; then each round sweep the in-flight workers and refill freed slots —
  until nothing is in flight. On an abnormal exit (exception or interrupt) the in-flight workers are
  canceled before rethrowing, so they don't keep writing under a run that is about to be failed."
  [init-state {:keys [run-gone? timeout-ms] :as ctx}]
  (let [last-st (volatile! init-state)
        step!   (fn [st] (vreset! last-st st) st)]
    (try
      (loop [st (step! (dispatch-ready! init-state ctx))]
        (cond
          (not (busy? st))
          st

          (run-gone?)
          (do (cancel-in-flight! st)
              (assoc st :aborted? true))

          :else
          (let [st (-> st
                       (sweep-workers! timeout-ms)
                       (dispatch-ready! ctx)
                       step!)]
            (Thread/sleep 250)
            (recur st))))
      (catch Throwable t
        (cancel-in-flight! @last-st)
        (throw t)))))

(defn- app-db-now
  []
  (:now (t2/query-one {:select [[[:raw "current_timestamp"] :now]]})))

(defn run-transforms!
  "Run `transform-ids-to-run` and their dependencies, honoring the DAG.

  Each transform runs on its own thread; SQL transforms run concurrently up to
  `transform-run-job-sql-concurrency`, python transforms one at a time (the python-runner service has
  a single worker). A failed dependency fails its dependents transitively; a worker that overruns the
  transform timeout (plus grace) is interrupted and failed.

  Transforms pulled into the plan only as dependencies (not directly requested) are skipped while
  still fresh, unless `skip-fresh-deps?` is false.

  Returns `{::status :succeeded}`, `{::status :failed ::failures [...]}`, or `{::status :aborted}`
  when the job run was terminated externally (e.g. reaped) while this coordinator was still running."
  [run-id transform-ids-to-run {:keys [run-method start-promise user-id skip-fresh-deps?]
                                :or   {skip-fresh-deps? true}}]
  (let [gone (promise)
        _    (swap! active-runs assoc run-id gone)
        final-state
        (try
          (let [{plan :order deps :deps} (get-plan transform-ids-to-run)
                requested  (set transform-ids-to-run)
                closure    (into #{} (map :id) plan)
                ;; Only deps pulled into the plan (not directly requested) are freshness-gated. Seeding them
                ;; as :succeeded lets their dependents dispatch while they themselves are never submitted.
                skip       (or (when skip-fresh-deps?
                                 (freshness/fresh-dep-ids (app-db-now) (set/difference closure requested)))
                               #{})
                init-state {:succeeded         skip
                            :failed            #{}
                            :failures          []
                            ;; per lane: transform-id -> {:future :timer :tkey :transform}
                            :in-flight         {:sql {} :py {}}
                            ;; target tables currently being written by an in-flight transform
                            :in-flight-targets #{}}
                ctx        {:plan       plan
                            :deps       deps
                            :run-id     run-id
                            :run-gone?  #(realized? gone)
                            :run-method run-method
                            :user-id    user-id
                            ;; lane -> max concurrent workers
                            :lanes      {:sql (max 1 (transforms.settings/transform-run-job-sql-concurrency))
                                         :py  1}
                            :timeout-ms (+ (u/minutes->ms (transforms.settings/transform-timeout))
                                           transform-worker-grace-ms)}]
            (when (seq skip)
              (log/infof "Skipping %d fresh pulled-in dependency transform(s): %s" (count skip) (pr-str skip)))
            (when start-promise (deliver start-promise :started))
            (run-coordinator-loop! init-state ctx))
          (finally
            (swap! active-runs dissoc run-id)))]
    (cond
      (:aborted? final-state)       {::status :aborted}
      (seq (:failures final-state)) {::status :failed ::failures (:failures final-state)}
      :else                         {::status :succeeded})))

(defn- job-transform-ids [job-id]
  (let [tag-ids (t2/select-fn-set :tag_id :model/TransformJobTransformTag :job_id job-id)]
    (if (seq tag-ids)
      (or (t2/select-fn-set :transform_id :model/TransformTransformTag :tag_id [:in tag-ids])
          #{})
      #{})))

(defn job-transforms
  "Return the transforms that are executed when running the job with ID `job-id`, in execution order.

  Transforms pulled into the plan only as dependencies are marked with `:dependency true`
  and `:scheduled` (whether any active job's schedule covers them)."
  [job-id]
  (let [tagged    (job-transform-ids job-id)
        plan      (:order (get-plan tagged))
        dep-ids   (into #{} (comp (map :id) (remove tagged)) plan)
        scheduled (set (keys (transform-tag/schedules-for-transforms dep-ids)))]
    (map (fn [{:keys [id] :as transform}]
           (cond-> transform
             (contains? dep-ids id) (assoc :dependency true
                                           :scheduled  (contains? scheduled id))))
         plan)))

(defn- compile-transform-failure-messages [failures]
  (->> failures
       (map (fn [failure]
              (format "%s %s:\n%s"
                      (:name (::transform failure))
                      (urls/transform-run-url (:id (::transform failure)))
                      (::message failure))))
       (str/join "\n\n")))

(defn- active-users-to-edit-transform
  "Return the users that edited the transform, in reverse chron.
  Only returns active users.
  And each user is unique.
  Returns `nil` if there isn't one."
  [transform-id]
  (when-some [revisions (seq (revisions/revisions :model/Transform transform-id))]
    (let [user-ids (map :user_id revisions)
          distinct-user-ids (distinct user-ids)
          users (t2/select :model/User :id [:in distinct-user-ids] :is_active true)
          by-id (u/index-by :id users)]
      ;; maintain order
      (map by-id distinct-user-ids))))

(defn- active-admins
  []
  (t2/select :model/User :is_superuser true :is_active true))

(defn- transform-creator
  [transform]
  (t2/select :model/User :id (:creator_id transform) :is_active true))

(defn- users-to-notify-of-transform-failure [transform]
  (or (seq (take 1 (active-users-to-edit-transform (:id transform))))
      (seq (transform-creator transform))
      (seq (active-admins))))

(defn- structure-message
  "Split a message into first line and detail lines for safe template rendering."
  [message]
  (let [[first-line & rest] (str/split message #"\n")]
    {:first_line first-line
     :details (vec rest)}))

(defn- notify-transform-failures
  [job-id failures]
  ;; We intend to notify users of failures during a cron run.
  ;; The user to notify is the last person to modify the transform
  ;; or the creator if it hasn't been modified.
  ;; Or the admins if the creator is not active.
  ;; We hope that this will be the most recent user.
  (let [job (t2/select-one :model/TransformJob job-id)
        failures (map (fn [failure]
                        (let [transform (::transform failure)]
                          (assoc failure ::emails (->> transform
                                                       users-to-notify-of-transform-failure
                                                       (keep :email)))))
                      failures)
        by-user (group-by ::emails failures)]
    (doseq [[user-emails failures] by-user
            email user-emails]
      (events/publish-event! :event/transform-failed
                             {:email email
                              :job_name (:name job)
                              :job_href (urls/transform-job-url job-id)
                              :failure_count (count failures)
                              :failures (mapv (fn [failure]
                                                {:transform_name (:name (::transform failure))
                                                 :transform_href (urls/transform-run-url (:id (::transform failure)))
                                                 :message (structure-message (::message failure))})
                                              failures)}))))

(defn run-job!
  "Runs all transforms for a given job and their dependencies."
  [job-id {:keys [run-method] :as opts}]
  (if (transforms.job-run/running-run-for-job-id job-id)
    (log/info "Not executing transform job" (pr-str job-id) "because it is already running")
    (let [transforms (job-transform-ids job-id)]
      (if (empty? transforms)
        (log/info "Skipping transform job" (pr-str job-id) "because it has no transforms to run")
        (let [{run-id :id} (transforms.job-run/start-run! job-id run-method)]
          (tracing/with-span :tasks "task.transform.run-job" {:transform.job/id         job-id
                                                              :transform.job/run-method (name run-method)
                                                              :transform.job/count      (count transforms)}
            (transforms.instrumentation/with-job-timing [job-id run-method]
              (try ;; catch any catastrophic problems
                (let [result (run-transforms! run-id transforms opts)]
                  (case (::status result)
                    :succeeded (transforms.job-run/succeed-started-run! run-id)
                    ;; terminated externally (e.g. reaped): the row is already terminal and the
                    ;; terminator already notified, so just log
                    :aborted (log/warnf "Transform job run %s for job %s was terminated externally; coordinator aborted."
                                        (pr-str run-id) (pr-str job-id))
                    :failed (try
                              (transforms.job-run/fail-started-run! run-id {:message (compile-transform-failure-messages (::failures result))})
                              (when (= :cron run-method)
                                (notify-transform-failures job-id (::failures result)))
                              (catch Exception e
                                (log/error e "Error when failing a transform run.")))))
                (catch Throwable t
                  ;; We don't expect a catastrophic failure, but neither did the Titanic.
                  (try
                    (transforms.job-run/fail-started-run! run-id {:message (.getMessage t)})
                    (when (and (::transform-failure (ex-data t))
                               (= :cron run-method)) ;; Catastrophic job failures are included in the digest
                      (notify-transform-failures job-id (::failures (ex-data t))))
                    (catch Exception e
                      (log/error e "Error when failing a transform job run.")))
                  (throw t)))))
          run-id)))))

(defn- reap-orphaned-runs!
  "Reap job runs whose coordinator process died (stale heartbeat)."
  []
  (transforms.job-run/reap-orphaned-runs! transform-job-heartbeat-stale-minutes))

(defmethod task/init! ::TransformJobRunHeartbeat [_]
  (rt/start-heartbeat! heartbeat-and-reconcile-runs! 1))

(defmethod task/init! ::TransformJobRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase.transforms.jobs.reaper-job"
                        :label   "transform job run"
                        :reap-fn #'reap-orphaned-runs!}))
