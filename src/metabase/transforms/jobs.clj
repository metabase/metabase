(ns metabase.transforms.jobs
  (:require
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
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-heartbeat-interval-ms
  "How often the coordinator stamps its run's heartbeat while polling for completions."
  (* 60 1000))

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

(defn- lane-for
  "Lane a transform runs in: `:py` for python transforms (single-slot), `:sql` otherwise."
  [t]
  (if (transforms-base.u/python-transform? t) :py :sql))

(defn- busy?
  "True while any transform is still in flight in either lane."
  [{:keys [in-flight]}]
  (some seq (vals in-flight)))

(defn- submit-transform!
  "Run `transform` on its own thread, delivering a `::status` completion map to the `result` promise
  when it finishes (normally or interrupted)."
  [run-id run-method user-id transform result]
  (future
    (let [ret (try
                (run-transform! run-id run-method user-id transform)
                {::status :succeeded ::transform transform}
                (catch Throwable t
                  (log/errorf t "Transform %s in run %s failed" (pr-str (:id transform)) (pr-str run-id))
                  {::status    :failed
                   ::transform transform
                   ::message   (or (ex-message t) (str t))
                   ::throwable t}))]
      (deliver result ret))))

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
         (let [result (promise)
               fut    (submit-transform! run-id run-method user-id t result)]
           (cond-> (assoc-in st [:in-flight lane-key id]
                             {:future fut :result result :timer (u/start-timer) :tkey tkey :transform t})
             tkey (update :in-flight-targets conj tkey)))

         :else st)))
   st
   plan))

(defn- sweep-workers!
  "Fold finished workers into the state, interrupt and fail workers that have outrun `timeout-ms`, and
  give up on interrupted workers that still haven't stopped after the drain grace."
  [st timeout-ms]
  (reduce-kv
   (fn [st lane-key workers]
     (reduce-kv
      (fn [st id {:keys [result timer draining tkey transform] fut :future}]
        (let [freed (cond-> (update-in st [:in-flight lane-key] dissoc id)
                      tkey (update :in-flight-targets disj tkey))]
          (cond
            (realized? result)
            (let [{::keys [status] :as completion} @result]
              (cond
                draining              freed
                (= status :succeeded) (update freed :succeeded conj id)
                ;; preserve the worker's failure context (::message / ::throwable)
                :else                 (-> freed
                                          (update :failed conj id)
                                          (update :failures conj (dissoc completion ::status)))))

            draining
            (if (>= (u/since-ms draining) transform-worker-grace-ms)
              (do (log/warnf "Interrupted worker for transform %s still running after the drain grace; abandoning its thread"
                             (pr-str id))
                  freed)
              st)

            (>= (u/since-ms timer) timeout-ms)
            (do (log/warnf "Transform %s exceeded its deadline; interrupting worker" (pr-str id))
                (future-cancel fut)
                (-> st
                    (assoc-in [:in-flight lane-key id :draining] (u/start-timer))
                    (update :failed conj id)
                    (update :failures conj
                            {::transform transform
                             ::message   (i18n/trs "Transform did not complete within the timeout and was interrupted.")})))

            :else st)))
      st
      workers))
   st
   (:in-flight st)))

(defn- interrupt-in-flight!
  "Best-effort interrupt of every in-flight worker."
  [st]
  (doseq [workers (vals (:in-flight st))
          {fut :future} (vals workers)]
    (future-cancel fut)))

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
  "Dispatch ready transforms; then each round sweep the in-flight workers, refill freed slots, and
  heartbeat the job run about every `job-heartbeat-interval-ms` — until nothing is in flight. Returns
  the final state, with `:aborted?` set if a heartbeat found the run terminated externally (in-flight
  workers are then interrupted)."
  [init-state {:keys [run-id timeout-ms] :as ctx}]
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
          (do (interrupt-in-flight! st)
              (assoc st :aborted? true))

          :else
          (let [st (-> st
                       (sweep-workers! timeout-ms)
                       (dispatch-ready! ctx))]
            (Thread/sleep 250)
            (recur st (if beat? (u/start-timer) hb))))))))

(defn run-transforms!
  "Run `transform-ids-to-run` and their dependencies, honoring the DAG.

  Each transform runs on its own thread; SQL transforms run concurrently up to
  `transform-run-job-sql-concurrency`, python transforms one at a time (the python-runner service has
  a single worker). A failed dependency fails its dependents transitively; a worker that overruns the
  transform timeout (plus grace) is interrupted and failed.

  Returns `{::status :succeeded}`, `{::status :failed ::failures [...]}`, or `{::status :aborted}`
  when the job run was terminated externally (e.g. reaped) while this coordinator was still running."
  [run-id transform-ids-to-run {:keys [run-method start-promise user-id]}]
  (let [{plan :order deps :deps} (get-plan transform-ids-to-run)
        init-state {:succeeded         #{}
                    :failed            #{}
                    :failures          []
                    ;; per lane: transform-id -> {:future :result :timer :tkey :transform :draining}
                    :in-flight         {:sql {} :py {}}
                    ;; target tables currently being written by an in-flight transform
                    :in-flight-targets #{}}
        ctx        {:plan       plan
                    :deps       deps
                    :run-id     run-id
                    :run-method run-method
                    :user-id    user-id
                    ;; lane -> max concurrent workers
                    :lanes      {:sql (max 1 (transforms.settings/transform-run-job-sql-concurrency))
                                 :py  1}
                    :timeout-ms (+ (u/minutes->ms (transforms.settings/transform-timeout))
                                   transform-worker-grace-ms)}]
    (when start-promise (deliver start-promise :started))
    (let [final-state (run-coordinator-loop! init-state ctx)]
      (cond
        (:aborted? final-state)       {::status :aborted}
        (seq (:failures final-state)) {::status :failed ::failures (:failures final-state)}
        :else                         {::status :succeeded}))))

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

;; No heartbeat task here: the coordinator heartbeats its own run from inside `run-transforms!` so
;; that liveness tracks actual progress, not a background timer.
(defmethod task/init! ::TransformJobRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase.transforms.jobs.reaper-job"
                        :label   "transform job run"
                        :reap-fn #'reap-and-notify-orphaned-runs!}))
