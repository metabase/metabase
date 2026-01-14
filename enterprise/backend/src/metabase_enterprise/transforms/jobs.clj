(ns metabase-enterprise.transforms.jobs
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [flatland.ordered.set :as ordered-set]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.instrumentation :as transforms.instrumentation]
   [metabase-enterprise.transforms.models.job-run :as transforms.job-run]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.channel.email :as email]
   [metabase.channel.urls :as urls]
   [metabase.task.core :as task]
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

(defn- run-transform! [run-id run-method {transform-id :id :as transform}]
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
      (transforms.execute/execute! transform {:run-method run-method})
      (transforms.job-run/add-run-activity! run-id))))

(defn run-transforms!
  "Run a series of transforms and their dependencies.

  Updates the transform-job-run specified by run-id after every completion.
  Returns a map with :status and a :message if failed."
  [run-id transform-ids-to-run {:keys [run-method start-promise]}]
  (let [{plan :order deps :deps} (get-plan transform-ids-to-run)
        successful (volatile! #{})
        failures (volatile! [])]
    (when start-promise
      (deliver start-promise :started))

    (doseq [transform plan]
      (if (every? @successful (get deps (:id transform)))
        (try
          (run-transform! run-id run-method transform)
          (vswap! successful conj (:id transform))
          (catch Exception e
            (vswap! failures conj {:transform transform
                                   :message (.getMessage e)})))
        (vswap! failures conj {:transform transform
                               :message (i18n/trs "Failed to run because one or more of the transforms it depends on failed.")})))

    (if @failures
      {:status :failed
       :failures @failures}
      {:status :succeeded})))

(defn- job-transform-ids [job-id]
  (t2/select-fn-set :transform_id
                    :transform_job_transform_tag
                    {:select    :transform_transform_tag.transform_id
                     :from      :transform_job_transform_tag
                     :left-join [:transform_transform_tag [:=
                                                           :transform_transform_tag.tag_id
                                                           :transform_job_transform_tag.tag_id]]
                     :where     [:= :transform_job_transform_tag.job_id job-id]}))

(defn job-transforms
  "Return the transforms that are executed when running the job with ID `job-id`.

  The transforms are returned in the order of their execution."
  [job-id]
  (:order (get-plan (job-transform-ids job-id))))

(defn- compile-transform-failure-messages [failures]
  (str/join "\n\n" (map #(str (:name (:transform %)) ":\n" (:message %)) failures)))

(defn- notify-transform-failures [job-id failures]
  (let [job (t2/select-one :model/TransformJob job-id)
        by-owner (group-by (comp :creator_id :transform) failures)]
    (doseq [[user-id failures] by-owner
            :let [user (t2/select-one :model/User user-id)]]
      (email/send-message! {:subject (i18n/trun "[Metabase] Failed transform run" "Failed transform runs" (count failures))
                            :recipients [(:email user)]
                            :message-type :text
                            :message (i18n/trs "Hello,\n\nThe following {0} occured when running the transform job called {1}:\n\n{2}\n\nVisit {3} for more information.\n\nThanks\n\nYour Metabase job scheduler"
                                               (i18n/trun "failure" "failures" (count failures))
                                               (:name job)
                                               (compile-transform-failure-messages failures)
                                               (urls/transform-job-url job-id))}))))

(defn- notify-job-failure [job-id message]
  (let [job (t2/select-one :model/TransformJob job-id)
        admin-emails (keep :email (t2/select :model/User :is_superuser true :is_active true))]
    (email/send-message! {:subject (i18n/trs "[Metabase] Failed transform job")
                          :recipients admin-emails
                          :message-type :text
                          :message (i18n/trs "Hello,\n\nThe following errors occured when running the transform job called {0}:\n\n{1}\n\nVisit {2} for more information.\n\nThanks\n\nYour Metabase job scheduler"
                                             (:name job)
                                             message
                                             (urls/transform-job-url job-id))})))

(defn run-job!
  "Runs all transforms for a given job and their dependencies."
  [job-id {:keys [run-method] :as opts}]
  (if (transforms.job-run/running-run-for-job-id job-id)
    (log/info "Not executing transform job" (pr-str job-id) "because it is already running")
    (let [transforms (job-transform-ids job-id)]
      (log/info "Executing transform job" (pr-str job-id) "with transforms" (pr-str transforms))
      (let [{run-id :id} (transforms.job-run/start-run! job-id run-method)]
        (transforms.instrumentation/with-job-timing [job-id run-method]
          (try
            (let [result (run-transforms! run-id transforms opts)]
              (case (:status result)
                :succeeded (transforms.job-run/succeed-started-run! run-id)
                :failed (do
                          (transforms.job-run/fail-started-run! run-id {:message (compile-transform-failure-messages (:failures result))})
                          (when (= :cron run-method)
                            (notify-transform-failures job-id (:failures result))))))
            (catch Throwable t
              ;; We don't expect a catastrophic failure, but neither did the Titanic.
              ;; We should clean up in this case and notify the admin users.
              (transforms.job-run/fail-started-run! run-id {:message (.getMessage t)})
              (when (= :cron run-method)
                (notify-job-failure job-id (.getMessage t)))
              (throw t))))
        run-id))))

(def ^:private job-key "metabase-enterprise.transforms.jobs.timeout-job")

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
