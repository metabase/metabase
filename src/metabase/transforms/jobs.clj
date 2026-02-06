(ns metabase.transforms.jobs
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [flatland.ordered.set :as ordered-set]
   [metabase.channel.urls :as urls]
   [metabase.events.core :as events]
   [metabase.models.transforms.job-run :as transforms.job-run]
   [metabase.models.transforms.transform-run :as transform-run]
   [metabase.revisions.core :as revisions]
   [metabase.task.core :as task]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.instrumentation :as transforms.instrumentation]
   [metabase.transforms.ordering :as transforms.ordering]
   [metabase.transforms.settings :as transforms.settings]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-deps [ordering transform-ids]
  (loop [found                                 #{}
         [current-transform & more-transforms] transform-ids]
    (if current-transform
      (recur (conj found current-transform)
             (if (found current-transform)
               more-transforms
               (into more-transforms (get ordering current-transform))))
      found)))

(defn- next-transform [ordering transforms-by-id complete]
  (-> (transforms.ordering/available-transforms ordering #{} complete)
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
  (let [all-transforms   (t2/select :model/Transform)
        global-ordering  (transforms.ordering/transform-ordering all-transforms)
        relevant-ids     (get-deps global-ordering transform-ids)
        transforms-by-id (into {}
                               (keep (fn [{:keys [id] :as transform}]
                                       (when (relevant-ids id)
                                         [id transform])))
                               all-transforms)
        ordering         (sorted-ordering (select-keys global-ordering relevant-ids) transforms-by-id)]
    (when-let [cycle (transforms.ordering/find-cycle ordering)]
      (let [id->name (into {} (map (juxt :id :name)) all-transforms)]
        (throw (ex-info (str "Cyclic transform definitions detected: "
                             (str/join " → " (map id->name cycle)))
                        {:cycle cycle}))))
    (loop [complete (ordered-set/ordered-set)]
      (if-let [current-transform (next-transform ordering transforms-by-id complete)]
        (recur (conj complete (:id current-transform)))
        {:order (map transforms-by-id complete)
         :deps global-ordering}))))

(defn- run-transform! [run-id run-method user-id {transform-id :id :as transform}]
  (if-not (transforms.util/check-feature-enabled transform)
    (log/warnf "Skip running transform %d due to lacking premium features" transform-id)
    (do
      (when (transform-run/running-run-for-transform-id transform-id)
        (log/warn "Transform" (pr-str transform-id) "already running, waiting")
        (loop []
          (Thread/sleep 2000)
          (when (transform-run/running-run-for-transform-id transform-id)
            (recur))))
      (log/info "Executing job transform" (pr-str transform-id))
      (transforms.execute/execute! transform {:run-method run-method
                                              :user-id user-id})
      (transforms.job-run/add-run-activity! run-id))))

(defn run-transforms!
  "Run a series of transforms and their dependencies.

  Updates the transform-job-run specified by run-id after every completion.
  Returns a map with :status and a collection of :failures if failed."
  [run-id transform-ids-to-run {:keys [run-method start-promise user-id]}]
  (let [{plan :order deps :deps} (get-plan transform-ids-to-run)
        successful (volatile! #{})
        failures (volatile! [])]
    (when start-promise
      (deliver start-promise :started))

    (doseq [transform plan]
      (if (every? @successful (get deps (:id transform)))
        (try
          (run-transform! run-id run-method user-id transform)
          (vswap! successful conj (:id transform))
          (catch Exception e
            (vswap! failures conj {::transform transform
                                   ::message (.getMessage e)})))
        (vswap! failures conj {::transform transform
                               ::message (i18n/trs "Failed to run because one or more of the transforms it depends on failed.")})))

    (if (seq @failures)
      {::status :failed
       ::failures @failures}
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
      (log/info "Executing transform job" (pr-str job-id) "with transforms" (pr-str transforms))
      (let [{run-id :id} (transforms.job-run/start-run! job-id run-method)]
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
              (throw t))))
        run-id))))

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
