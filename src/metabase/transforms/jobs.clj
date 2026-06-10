(ns metabase.transforms.jobs
  (:require
   [clojure.string :as str]
   [flatland.ordered.set :as ordered-set]
   [metabase.channel.urls :as urls]
   [metabase.events.core :as events]
   [metabase.revisions.core :as revisions]
   [metabase.run-tracking.core :as rt]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.models.job-run :as transforms.job-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.transforms.usage :as transforms.usage]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent BlockingQueue ExecutorService Executors Future LinkedBlockingQueue RejectedExecutionException ThreadFactory TimeUnit)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

(def ^:private job-heartbeat-interval-ms
  "How often the coordinator stamps its run's heartbeat while polling for completions."
  (* 60 1000))

(def ^:private transform-job-heartbeat-stale-minutes
  "A job run whose coordinator hasn't heartbeat in this many minutes is presumed dead and reaped."
  5)

(def ^:private transform-worker-grace-ms
  "Slack beyond the transform run timeout before the coordinator interrupts a worker that ignored its
  own timeout — and again how long an interrupted worker may drain before its thread is abandoned."
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
    (let [all-transforms (t2/select :model/Transform)
          ;; Walk only the dependency closure of the transforms we're asked to run.
          ;; `table-dependencies` (and the QP preprocessing it triggers) is therefore called
          ;; only on transforms in that closure — never on unrelated transforms elsewhere in
          ;; the system. This is what prevents a single broken transform (e.g. one on a
          ;; routing-enabled database) from poisoning the scheduler when no job has asked for it.
          {:keys [dependencies not-found failed]}
          (transforms-base.ordering/transform-ordering transform-ids all-transforms)]
      (when (seq not-found)
        (log/warnf "transform-ordering: %d scheduled id(s) not found in transforms (likely deleted between scheduling and lookup): %s"
                   (count not-found) (pr-str (sort not-found))))
      (when (seq failed)
        (log/warnf "transform-ordering: %d transform(s) failed dep extraction; treated as leaves: %s"
                   (count failed) (pr-str (sort failed))))
      (let [transforms-by-id (into {}
                                   (keep (fn [{:keys [id] :as transform}]
                                           (when (contains? dependencies id)
                                             [id transform])))
                                   all-transforms)
            sorted-ord       (sorted-ordering dependencies transforms-by-id)]
        (when-let [cycle (transforms-base.ordering/find-cycle sorted-ord)]
          (let [id->name (into {} (map (juxt :id :name)) all-transforms)]
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

(defn- run-transform! [run-id run-method user-id {transform-id :id :as transform}]
  (cond
    (not (transforms.u/check-feature-enabled transform))
    (log/warnf "Skip running transform %d due to lacking premium features" transform-id)

    (transforms.usage/transform-locked? transform)
    (log/warnf "Skip running transform %d due to locked meter (trial quota exhausted)" transform-id)

    :else
    (tracing/with-span :tasks "task.transform.execute" {:transform/id   transform-id
                                                        :transform/name (:name transform)}
      ;; A single deadline spans the whole wait-and-retry sequence so repeated start races can't
      ;; extend the wait past the bound.
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
                                                                   :user-id user-id})
                           :ok
                           (catch Exception e
                             ;; Raced with another starter that won the is_active slot; wait again.
                             (if (= :already-running (:error (ex-data e)))
                               :already-running
                               (throw e))))]
              (when (= :already-running result)
                (recur))))))
      (transforms.job-run/add-run-activity! run-id))))

(defn- named-thread-factory ^ThreadFactory [pattern]
  (.build (doto (BasicThreadFactory$Builder.)
            (.namingPattern pattern)
            (.daemon true))))

(defn- lane-for
  "Lane a transform runs in: `:py` for python transforms (single-slot), `:sql` otherwise."
  [t]
  (if (transforms-base.u/python-transform? t) :py :sql))

(defn- busy?
  "True while any transform is still in flight in either lane."
  [{:keys [in-flight]}]
  (some seq (vals in-flight)))

(defn- submit-transform! ^Future
  [^ExecutorService executor
   ^BlockingQueue completions
   run-id run-method user-id transform]
  (let [task (bound-fn []
               (let [tid (:id transform)]
                 (try
                   (run-transform! run-id run-method user-id transform)
                   (.put completions {::status :succeeded ::transform transform})
                   (catch Throwable t
                     (log/errorf t "Transform %s in run %s failed" (pr-str tid) (pr-str run-id))
                     (.put completions {::status    :failed
                                        ::transform transform
                                        ::message   (or (ex-message t) (str t))
                                        ::throwable t})))))]
    (.submit executor ^Runnable task)))

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
  [st {:keys [plan deps lanes completions run-id run-method user-id]}]
  (reduce
   (fn [{:keys [succeeded failed in-flight-targets] :as st} t]
     (let [id            (:id t)
           dep-ids       (get deps id)
           lane-key      (lane-for t)
           {:keys [^ExecutorService executor capacity]} (get lanes lane-key)
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
              (< (count in-flight-now) capacity))
         (try
           (let [fut (submit-transform! executor completions run-id run-method user-id t)]
             (cond-> (assoc-in st [:in-flight lane-key id] {:future fut :timer (u/start-timer) :tkey tkey :transform t})
               tkey (update :in-flight-targets conj tkey)))
           (catch RejectedExecutionException e
             ;; The pool was shut down out from under us (abnormal-exit window). Record the failure so
             ;; the run reflects the partial dispatch rather than silently dropping this transform.
             (-> st
                 (update :failed conj id)
                 (update :failures conj
                         {::transform t
                          ::message (or (ex-message e) (str e))}))))

         :else st)))
   st
   plan))

(defn- apply-completion
  "Fold a worker completion into the state, freeing its lane slot and target. Completions for a worker
  the coordinator already failed (`:draining`, or abandoned and no longer tracked) don't affect the
  outcome."
  [st {::keys [transform status] :as completion}]
  (let [id       (:id transform)
        lane-key (lane-for transform)]
    (if-let [{:keys [tkey draining]} (get-in st [:in-flight lane-key id])]
      (let [st (cond-> (update-in st [:in-flight lane-key] dissoc id)
                 tkey (update :in-flight-targets disj tkey))]
        (cond
          draining              st
          (= status :succeeded) (update st :succeeded conj id)
          ;; Preserve the worker's failure context (::message / ::throwable); dispatch-ready!'s
          ;; dep-failure path produces a subset of the same shape (::message only).
          :else                 (-> st
                                    (update :failed conj id)
                                    (update :failures conj (dissoc completion ::status)))))
      st)))

(defn- sweep-overdue-workers!
  "Interrupt and fail any worker that has outrun `timeout-ms` — the hard backstop for a worker that
  ignored its own (query/cancel) timeout. The interrupt only sets a flag: the worker may keep running
  (and keep writing its target table), so it stays in flight as `:draining`, holding its lane slot and
  target until its completion arrives ([[apply-completion]]) or the drain grace expires, at which
  point its thread is abandoned and the slot freed."
  [st timeout-ms]
  (reduce-kv
   (fn [st lane-key workers]
     (reduce-kv
      (fn [st id {:keys [timer draining tkey] :as worker}]
        (let [^Future fut (:future worker)]
          (cond
            ;; interrupted earlier and still running: abandon it once the drain grace is up
            draining
            (if (>= (u/since-ms draining) transform-worker-grace-ms)
              (do (log/warnf "Interrupted worker for transform %s still running after the drain grace; abandoning its thread"
                             (pr-str id))
                  (-> st
                      (update-in [:in-flight lane-key] dissoc id)
                      (cond-> tkey (update :in-flight-targets disj tkey))))
              st)

            ;; not overdue, or finished right at the deadline (its queued completion will resolve it)
            (or (< (u/since-ms timer) timeout-ms) (.isDone fut))
            st

            :else
            (do (log/warnf "Transform %s exceeded its deadline; interrupting worker" (pr-str id))
                (.cancel fut true)
                (-> st
                    (assoc-in [:in-flight lane-key id :draining] (u/start-timer))
                    (update :failed conj id)
                    (update :failures conj
                            {::transform (:transform worker)
                             ::message   (i18n/trs "Transform did not complete within the timeout and was interrupted.")}))))))
      st
      workers))
   st
   (:in-flight st)))

(defn- heartbeat!
  "Stamp the job run's heartbeat. Returns `:ok`, `:gone` (the run was terminated externally, e.g.
  reaped — abort), or `:error` (the stamp failed, e.g. transient app-db trouble — keep going)."
  [run-id]
  (try
    (if (pos? (transforms.job-run/heartbeat-runs! [run-id])) :ok :gone)
    (catch Throwable e
      (log/warnf e "Failed to heartbeat transform job run %s" (pr-str run-id))
      :error)))

(defn- run-coordinator-loop!
  "Dispatch ready transforms; each round sweep overdue workers, drain a completion, refill freed slots,
  and heartbeat the job run about every `job-heartbeat-interval-ms` — until nothing is in flight.
  Returns the final state, with `:aborted?` set if a heartbeat found the run terminated externally
  (the caller's executor shutdown then interrupts the workers)."
  [init-state {:keys [^BlockingQueue completions run-id timeout-ms] :as ctx}]
  ;; the initial beat catches a run reaped during (slow) planning, before we dispatch anything
  (if (= :gone (heartbeat! run-id))
    (assoc init-state :aborted? true)
    (loop [st (dispatch-ready! init-state ctx)
           hb (u/start-timer)]
      (let [beat? (>= (u/since-ms hb) job-heartbeat-interval-ms)]
        (cond
          (not (busy? st))
          st

          (and beat? (= :gone (heartbeat! run-id)))
          (assoc st :aborted? true)

          :else
          (let [st (sweep-overdue-workers! st timeout-ms)
                st (if-let [completion (.poll completions job-heartbeat-interval-ms TimeUnit/MILLISECONDS)]
                     (apply-completion st completion)
                     st)]
            (recur (dispatch-ready! st ctx)
                   (if beat? (u/start-timer) hb))))))))

(defn run-transforms!
  "Run `transform-ids-to-run` and their dependencies, honoring the DAG.

  SQL transforms run concurrently up to `transform-run-job-sql-concurrency`; python transforms run in
  a single-slot lane. A failed dependency fails its dependents transitively; a worker that overruns
  the transform timeout (plus grace) is interrupted and failed.

  Returns `{::status :succeeded}`, `{::status :failed ::failures [...]}`, or `{::status :aborted}`
  when the job run was terminated externally (e.g. reaped) while this coordinator was still running."
  [run-id transform-ids-to-run {:keys [run-method start-promise user-id]}]
  (let [{plan :order deps :deps} (get-plan transform-ids-to-run)
        n            (max 1 (transforms.settings/transform-run-job-sql-concurrency))
        ;; Unbounded pools: lane concurrency is enforced by dispatch-ready!'s in-flight bookkeeping,
        ;; not pool size, so a transform dispatched after an abandoned worker gets a fresh thread
        ;; instead of queueing behind it.
        sql-executor (Executors/newCachedThreadPool (named-thread-factory "transforms-sql-worker-%d"))
        py-executor  (Executors/newCachedThreadPool (named-thread-factory "transforms-python-worker-%d"))
        init-state   {:succeeded         #{}
                      :failed            #{}
                      :failures          []
                      ;; per lane: transform-id -> {:future :timer :tkey :transform :draining}
                      :in-flight         {:sql {} :py {}}
                      ;; target tables currently being written by an in-flight transform
                      :in-flight-targets #{}}
        ctx          {:plan        plan
                      :deps        deps
                      ;; unbounded (each worker puts exactly one completion) so an abandoned worker
                      ;; can always deposit its late completion and exit
                      :completions (LinkedBlockingQueue.)
                      :run-id      run-id
                      :run-method  run-method
                      :user-id     user-id
                      :lanes       {:sql {:executor sql-executor :capacity n}
                                    :py  {:executor py-executor  :capacity 1}}
                      :timeout-ms  (+ (u/minutes->ms (transforms.settings/transform-timeout))
                                      transform-worker-grace-ms)}]
    (when start-promise (deliver start-promise :started))
    (let [final-state (try
                        (run-coordinator-loop! init-state ctx)
                        (finally
                          ;; shutdownNow interrupts any workers still running against a run that is
                          ;; already resolved.
                          (.shutdownNow sql-executor)
                          (.shutdownNow py-executor)))]
      (cond
        (:aborted? final-state)        {::status :aborted}
        (seq (:failures final-state))  {::status :failed ::failures (:failures final-state)}
        :else                          {::status :succeeded}))))

(defn- job-transform-ids [job-id]
  (let [tag-ids (t2/select-fn-set :tag_id :model/TransformJobTransformTag :job_id job-id)]
    (if (seq tag-ids)
      (or (t2/select-fn-set :transform_id :model/TransformTransformTag :tag_id [:in tag-ids])
          #{})
      #{})))

(defn job-transforms
  "Return the transforms that are executed when running the job with ID `job-id`.

  The transforms are returned in the order of their execution."
  [job-id]
  (:order (get-plan (job-transform-ids job-id))))

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

(defn- notify-job-failure
  "Notify admins of a catastrophic job failure (not individual transform failures).

  Publishes a single event; the seeded `system-event/transform-job-failed` notification
  fans out to all admins in one bcc email (see [[metabase.notification.seed/seed-notification!]])."
  [job-id message]
  (let [job (t2/select-one :model/TransformJob job-id)]
    (events/publish-event! :event/transform-job-failed
                           {:job_name (:name job)
                            :job_href (urls/transform-job-url job-id)
                            :failure_count 1
                            :failures [{:message (structure-message message)}]})))

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
                  ;; We should clean up in this case and notify the admin users.
                  (try
                    (transforms.job-run/fail-started-run! run-id {:message (.getMessage t)})
                    (when (= :cron run-method)
                      (if (::transform-failure (ex-data t))
                        (notify-transform-failures job-id (::failures (ex-data t)))
                        (notify-job-failure job-id (.getMessage t))))
                    (catch Exception e
                      (log/error e "Error when failing a transform job run.")))
                  (throw t)))))
          run-id)))))

(defn- reap-and-notify-orphaned-runs!
  "Reap job runs whose coordinator process died (stale heartbeat), notify admins for each reaped cron run,
  and return the reaped rows."
  []
  (let [reaped (transforms.job-run/reap-orphaned-runs! transform-job-heartbeat-stale-minutes)]
    (doseq [{:keys [job_id run_method message]} reaped
            :when (= run_method :cron)]
      (try
        (notify-job-failure job_id (or message "Timed out: no heartbeat"))
        (catch Throwable t
          (log/error t "Error notifying of reaped transform job run" (pr-str job_id)))))
    reaped))

;; No `:heartbeat-fn`: the coordinator heartbeats its own run from inside `run-transforms!` so that
;; liveness tracks actual progress, not a background timer. Only the orphan reaper is scheduled here.
(rt/defrun-tracking-jobs TransformJobRun
  {:reap-fn    reap-and-notify-orphaned-runs!
   :reaper-key "metabase.transforms.jobs.reaper-job"})
