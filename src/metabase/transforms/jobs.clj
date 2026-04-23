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
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.models.job-run :as transforms.job-run]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
  (if-not (transforms.u/check-feature-enabled transform)
    (log/warnf "Skip running transform %d due to lacking premium features" transform-id)
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

(defn- submit-transform!
  [^java.util.concurrent.ExecutorService executor
   ^java.util.concurrent.BlockingQueue completions
   run-id run-method user-id transform]
  ;; `bound-fn` propagates the coordinator thread's dynamic bindings (*current-user-id*, QP
  ;; bindings, etc.) to the worker thread.
  (let [task (bound-fn []
               (let [result (try
                              (run-transform! run-id run-method user-id transform)
                              {::status :succeeded}
                              (catch Throwable t
                                {::status :failed
                                 ::message (or (ex-message t) (str t))}))]
                 (.put completions (assoc result ::transform transform))))]
    (.submit executor ^Runnable task)))

(defn run-transforms!
  "Run a series of transforms and their dependencies.

  Transforms are dispatched concurrently up to `transform-job-concurrency`, respecting the DAG:
  a transform is only started once all of its dependencies have succeeded. If a dependency
  failed, dependents are recorded as failures (transitively) without being executed.

  Updates the transform-job-run specified by run-id after every completion.
  Returns a map with :status and a collection of :failures if failed."
  [run-id transform-ids-to-run {:keys [run-method start-promise user-id]}]
  (let [{plan :order deps :deps} (get-plan transform-ids-to-run)
        n           (max 1 (transforms.settings/transform-job-concurrency))
        succeeded   (volatile! #{})
        failed      (volatile! #{})
        in-flight   (volatile! #{})
        failures    (volatile! [])
        completions (java.util.concurrent.LinkedBlockingQueue.)
        executor    (java.util.concurrent.Executors/newFixedThreadPool n)
        record-dep-failure!
        (fn [t]
          (vswap! failed conj (:id t))
          (vswap! failures conj {::transform t
                                 ::message (i18n/trs "Failed to run because one or more of the transforms it depends on failed.")}))
        ;; Walk plan in topological order: skip dep-failed, dispatch ready ones that fit. Because
        ;; deps appear before dependents, a cascade of dep-failures propagates in a single pass.
        dispatch!
        (fn []
          (doseq [t     plan
                  :let  [id (:id t), dep-ids (get deps id)]
                  :when (not (or (@succeeded id) (@failed id) (@in-flight id)))]
            (cond
              (some @failed dep-ids)
              (record-dep-failure! t)

              (and (every? @succeeded dep-ids)
                   (< (count @in-flight) n))
              (do (vswap! in-flight conj id)
                  (submit-transform! executor completions run-id run-method user-id t)))))]
    (when start-promise
      (deliver start-promise :started))
    (try
      (dispatch!)
      (while (seq @in-flight)
        (let [{::keys [transform status message]} (.take completions)
              id (:id transform)]
          (vswap! in-flight disj id)
          (case status
            :succeeded (vswap! succeeded conj id)
            :failed    (do (vswap! failed conj id)
                           (vswap! failures conj {::transform transform
                                                  ::message message})))
          (dispatch!)))
      (finally
        (.shutdown executor)))
    (if (seq @failures)
      {::status :failed ::failures @failures}
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

(task/defjob  ^{:doc "Times out transform jobs when necessary."
                org.quartz.DisallowConcurrentExecution true}
  TimeoutOldRuns [_ctx]
  (transforms.job-run/timeout-old-runs! (transforms.settings/transform-timeout) :minute))

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
