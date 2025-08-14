(ns metabase-enterprise.transforms.jobs
  (:require
   [clojure.string :as str]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.calendar-interval :as calendar-interval]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.models.job-run :as transforms.job-run]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.ordering :as transforms.ordering]
   [metabase-enterprise.transforms.settings :as transforms.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- get-deps [ordering transform-ids]
  (loop [found #{}
         [current-transform & more-transforms] transform-ids]
    (if current-transform
      (recur (conj found current-transform)
             (if (found current-transform)
               more-transforms
               (into more-transforms (get ordering current-transform))))
      found)))

(defn- get-plan [transform-ids]
  (let [all-transforms (t2/select :model/Transform)
        global-ordering (transforms.ordering/transform-ordering all-transforms)
        relevant-ids (get-deps global-ordering transform-ids)
        ordering (select-keys global-ordering relevant-ids)]
    (when-let [cycle (transforms.ordering/find-cycle ordering)]
      (let [id->name (into {} (map (juxt :id :name)) all-transforms)]
        (throw (ex-info (str "Cyclic transform definitions detected: "
                             (str/join " → " (map id->name cycle)))
                        {:cycle cycle}))))
    {:transforms-by-id (into {}
                             (keep (fn [{:keys [id] :as transform}]
                                     (when (relevant-ids id)
                                       [id transform])))
                             all-transforms)
     :ordering ordering}))

(defn- next-transform [{:keys [ordering transforms-by-id]} complete]
  (-> (transforms.ordering/available-transforms ordering #{} complete)
      first
      transforms-by-id))

(defn run-transforms! [run-id transform-ids-to-run {:keys [run-method start-promise]}]
  (let [plan (get-plan transform-ids-to-run)]
    (when start-promise
      (deliver start-promise :started))
    (loop [complete #{}
           in-progress nil]
      (when-let [{transform-id :id :as current-transform} (next-transform plan complete)]
        (cond
          (transform-run/running-run-for-run-id transform-id)
          (do
            (log/info "Transform" (pr-str transform-id) "already running, sleeping")
            (Thread/sleep 2000)
            (recur complete transform-id))

          in-progress
          (recur (conj complete in-progress) nil)

          :else
          (do
            (log/info "Executing job transform" (pr-str transform-id))
            (transforms.execute/run-mbql-transform! current-transform {:run-method run-method})
            (transforms.job-run/add-run-activity! run-id)
            (recur (conj complete (:id current-transform)) nil)))))))

(defn run-job!
  [job-id {:keys [run-method] :as opts}]
  (if (transforms.job-run/running-run-for-job-id job-id)
    (log/info "Not executing transform job" (pr-str job-id) "because it is already running")
    (let [transforms (t2/select-fn-set :transform_id
                                       :transform_job_tags
                                       {:select :transform_tags.transform_id
                                        :from :transform_job_tags
                                        :left-join [:transform_tags [:=
                                                                     :transform_tags.tag_id
                                                                     :transform_job_tags.tag_id]]
                                        :where [:= :transform_job_tags.job_id job-id]})]
      (log/info "Executing transform job" (pr-str job-id) "with transforms" (pr-str transforms))
      (let [{run-id :id} (transforms.job-run/start-run! job-id run-method)]
        (try
          (run-transforms! run-id transforms opts)
          (transforms.job-run/succeed-started-run! run-id)
          (catch Throwable t
            (transforms.job-run/fail-started-run! run-id {:message (.getMessage t)})
            (throw t)))))))

(def ^:private job-key "metabase-enterprise.transforms.jobs.timeout-job")

(task/defjob  ^{:doc "Times out transform jobs when necesssary."
                org.quartz.DisallowConcurrentExecution true}
  TimeoutOldRuns [_ctx]
  (transforms.job-run/timeout-old-runs! (transforms.settings/transform-timeout) :minute))

(defn- start-job! []
  (when (not (task/job-exists? job-key))
    (let [job (jobs/build
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
