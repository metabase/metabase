(ns metabase.transforms.jobs
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [flatland.ordered.set :as ordered-set]
   [metabase.channel.urls :as urls]
   [metabase.events.core :as events]
   [metabase.revisions.core :as revisions]
   [metabase.task.core :as task]
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
   (java.util.concurrent ArrayBlockingQueue BlockingQueue ExecutorService Executors ThreadFactory)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

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

(defn- block-until-not-already-running [transform-id]
  (when-let [active-run (transform-run/running-run-for-transform-id transform-id)]
    (log/warn "Transform" (pr-str transform-id) "already running, waiting for run" (:id active-run))
    (while (transform-run/running-run-for-transform-id transform-id)
      (Thread/sleep 2000))))

(defn- run-transform! [run-id run-method user-id {transform-id :id :as transform}]
  (cond
    (not (transforms.u/check-feature-enabled transform))
    (log/warnf "Skip running transform %d due to lacking premium features" transform-id)

    (transforms.usage/transform-locked? transform)
    (log/warnf "Skip running transform %d due to locked meter (trial quota exhausted)" transform-id)

    :else
    (tracing/with-span :tasks "task.transform.execute" {:transform/id   transform-id
                                                        :transform/name (:name transform)}
      (block-until-not-already-running transform-id)
      (let [try-exec
            (fn []
              (try
                (log/info "Executing job transform" (pr-str transform-id))
                (transforms.execute/execute! transform {:run-method run-method
                                                        :user-id user-id})
                (catch Exception e
                  (if (= :already-running (:error (ex-data e)))
                    :already-running
                    (throw e)))))]
        (loop []
          (when (= :already-running (try-exec))
            (when (transform-run/running-run-for-transform-id transform-id)
              (log/warn "Transform" (pr-str transform-id) "already running, waiting")
              (loop []
                (Thread/sleep 2000)
                (when (transform-run/running-run-for-transform-id transform-id)
                  (recur))))
            (recur))))
      (transforms.job-run/add-run-activity! run-id))))

(defn- named-thread-factory ^ThreadFactory [pattern]
  (.build (doto (BasicThreadFactory$Builder.)
            (.namingPattern pattern)
            (.daemon true))))

(defn- submit-transform!
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
                     ;; Record the failure with as much debugging context as we can; the coordinator
                     ;; preserves these fields onto :failures. We catch Throwable (not just
                     ;; Exception) so a non-Exception Error — e.g. OutOfMemoryError — is still
                     ;; reported as a transform failure and lets the coordinator unwind cleanly,
                     ;; rather than vanishing into the worker's FutureTask. `::fatal` flags that case
                     ;; so consumers can distinguish it. (We don't rethrow: under `.submit` the
                     ;; FutureTask would just swallow it, so a rethrow would be a silent no-op.)
                     (.put completions {::status    :failed
                                        ::transform transform
                                        ::message   (or (ex-message t) (str t))
                                        ::ex-data   (ex-data t)
                                        ::throwable t
                                        ::fatal     (not (instance? Exception t))})))))]
    (.submit executor ^Runnable task)))

(defn- transform-target-key
  "A coarse identity for a transform's output table, used to keep two transforms that write the
  same target table from being dispatched concurrently. Returns nil when the transform has no
  resolved target (in which case it isn't subject to the co-writer guard)."
  [transform]
  (when-let [{:keys [database schema name]} (:target transform)]
    [database schema name]))

(defn run-transforms!
  "Run a series of transforms and their dependencies.

  SQL transforms are dispatched concurrently up to `transform-run-job-sql-concurrency`, respecting
  the DAG: a transform is only started once all of its dependencies have succeeded.

  Python transforms run in a separate single-slot lane regardless of the SQL pool size, because
  the python-runner service has only one worker; oversubscribing it would just queue requests
  against their own per-call timeouts.

  If a dependency failed, dependents are recorded as failures (transitively) without being
  executed.

  Updates the transform-job-run specified by run-id after every completion.
  Returns a map with :status and a collection of :failures if failed."
  [run-id transform-ids-to-run {:keys [run-method start-promise user-id]}]
  (let [{plan :order deps :deps} (get-plan transform-ids-to-run)
        n            (max 1 (transforms.settings/transform-run-job-sql-concurrency))
        sql-executor (Executors/newFixedThreadPool n (named-thread-factory "transforms-sql-worker-%d"))
        py-executor  (Executors/newSingleThreadExecutor (named-thread-factory "transforms-python-worker-%d"))
        lanes        {:sql {:executor sql-executor :capacity n}
                      :py  {:executor py-executor  :capacity 1}}
        lane-for     (fn [t] (if (transforms-base.u/python-transform? t) :py :sql))
        completions  (ArrayBlockingQueue. (max 2 (inc n)))
        state        (volatile! {:succeeded         #{}
                                 :failed            #{}
                                 :failures          []
                                 :in-flight         {:sql #{} :py #{}}
                                 ;; target tables currently being written by an in-flight transform
                                 :in-flight-targets #{}})
        busy?        (fn [{:keys [in-flight]}] (some seq (vals in-flight)))
        ;; Plan is topo-sorted, so a single pass propagates the full cascade of dep-failures.
        dispatch!    (fn [st]
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

                              ;; Defer if another in-flight transform is already writing this target
                              ;; table. `transform-ordering` builds DAG edges from table *reads*, not
                              ;; co-*writes*, so two transforms sharing a target are independent in
                              ;; the DAG and would otherwise dispatch concurrently — producing
                              ;; nondeterministic DDL. This shouldn't happen in a well-formed config;
                              ;; the guard just stops a misconfiguration from racing. Retried on a
                              ;; later pass once the in-flight writer completes (something is always
                              ;; in-flight while a target is held, so the loop won't exit early).
                              (and tkey (contains? in-flight-targets tkey))
                              st

                              (and (every? succeeded dep-ids)
                                   (< (count in-flight-now) capacity))
                              (try
                                (submit-transform! executor completions run-id run-method user-id t)
                                (cond-> (update-in st [:in-flight lane-key] conj id)
                                  tkey (update :in-flight-targets conj tkey))
                                (catch java.util.concurrent.RejectedExecutionException e
                                  ;; The pool was shut down out from under us (abnormal-exit window).
                                  ;; Record the failure so the run reflects the partial dispatch
                                  ;; rather than silently dropping this transform.
                                  (-> st
                                      (update :failed conj id)
                                      (update :failures conj
                                              {::transform t
                                               ::message (or (ex-message e) (str e))}))))

                              :else st)))
                        st
                        plan))]
    (when start-promise (deliver start-promise :started))
    (try
      (vreset! state (dispatch! @state))
      (while (busy? @state)
        (let [completion (.take completions)
              {::keys [transform status]} completion
              id       (:id transform)
              lane-key (lane-for transform)
              tkey     (transform-target-key transform)]
          (vswap! state
                  (fn [st]
                    (let [st' (cond-> (update-in st [:in-flight lane-key] disj id)
                                tkey (update :in-flight-targets disj tkey))]
                      (case status
                        :succeeded (update st' :succeeded conj id)
                        ;; Preserve the full failure context the worker attached (::message plus
                        ;; ::ex-data / ::throwable / ::fatal) so downstream consumers — notifications
                        ;; and logs — can surface it. dispatch!'s dep-failure path produces a subset
                        ;; of the same shape, and consumers only read ::transform / ::message.
                        :failed    (-> st'
                                       (update :failed conj id)
                                       (update :failures conj (dissoc completion ::status)))))))
          (vreset! state (dispatch! @state))))
      (finally
        ;; shutdownNow (not shutdown): on the happy path the in-flight set is already drained, so
        ;; this is equivalent to shutdown; on an abnormal exit (e.g. an interrupted take) it also
        ;; interrupts any workers still running against a run that has already been failed.
        (.shutdownNow sql-executor)
        (.shutdownNow py-executor)))
    (if (seq (:failures @state))
      {::status :failed ::failures (:failures @state)}
      {::status :succeeded})))

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
  "Notify admins of a catastrophic job failure (not individual transform failures)."
  [job-id message]
  (let [job (t2/select-one :model/TransformJob job-id)
        admin-emails (keep :email (active-admins))]
    (doseq [email admin-emails]
      (events/publish-event! :event/transform-failed
                             {:email email
                              :job_name (:name job)
                              :job_href (urls/transform-job-url job-id)
                              :failure_count 1
                              :failures [{:message (structure-message message)}]}))))

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

(def ^:private job-key "metabase.transforms.jobs.timeout-job")

(defn- timeout-and-notify-old-runs!
  "Time out stale job runs and notify admins for each cron-scheduled run that was
  timed out. Manual runs are left alone to mirror `run-job!`'s cron-only
  notification behavior."
  []
  (let [timed-out (transforms.job-run/timeout-old-runs!
                   (transforms.settings/transform-timeout) :minute)]
    (when (seq timed-out)
      (log/infof "Timed out %d transform job run(s)." (count timed-out)))
    (doseq [{:keys [job_id run_method message]} timed-out
            :when (= run_method :cron)]
      (try
        (notify-job-failure job_id (or message "Timed out by metabase"))
        (catch Throwable t
          (log/error t "Error notifying of timed-out transform job run" (pr-str job_id)))))))

(task/defjob  ^{:doc "Times out transform jobs when necessary."
                org.quartz.DisallowConcurrentExecution true}
  TimeoutOldRuns [_ctx]
  (tracing/with-span :tasks "task.transform.timeout-check" {:transform.timeout/type "job"}
    (timeout-and-notify-old-runs!)))

(defn- start-job! []
  (when (not (task/job-exists? job-key))
    (let [job     (jobs/build
                   (jobs/of-type TimeoutOldRuns)
                   (jobs/with-identity (jobs/key job-key)))
          trigger (triggers/build
                   (triggers/with-identity (triggers/key job-key))
                   (triggers/start-now)
                   (triggers/with-schedule
                    (calendar-interval/schedule
                     (calendar-interval/with-interval-in-minutes 10)
                     (calendar-interval/with-misfire-handling-instruction-do-nothing))))]
      (task/schedule-task! job trigger))))

(defmethod task/init! ::TimeoutJob [_]
  (log/info "Scheduling transform job timeout.")
  (start-job!))
