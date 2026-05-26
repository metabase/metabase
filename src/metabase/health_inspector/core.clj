(ns metabase.health-inspector.core
  (:require
   [clojure.core.reducers :as r]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema :as schema]
   [metabase.task.core :as task]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *delay*
  "Per-query delay to prevent overloading the system."
  5)

(defn- validate-query [{:keys [dataset_query]}]
  (Thread/sleep ^Long *delay*)
  (let [query (lib-be/normalize-query (json/decode dataset_query keyword))]
    (mr/validate ::schema/query query)))

(defn- percent [n] (* 100 (int n)))

(defn- validate-queries []
  (let [queries (t2/reducible-select :report_card {:where [:= :archived false]})
        results (into [] (r/map validate-query queries))
        ratio (if (empty? results)
                1
                (/ (count (filter identity results)) (count results)))]
    {:health (percent ratio)
     :message (if (= 1 ratio)
                "All queries valid."
                "Some queries are invalid.")}))

(defonce ^:private checks (atom {:validate-queries validate-queries}))

(defn register-check!
  "Register a new check function with a given name.
  Check functions take no args and return a map with a :health ratio and :description string."
  [name check-fn]
  (swap! checks assoc name check-fn))

(defn report
  "Run all registered checks and produce a report describing potential problems."
  []
  (into {} (for [[name f] @checks]
             [name (f)])))

(defn save-report
  "Run a health inspector report and save it to the DB."
  []
  (doseq [[check-name result] (report)]
    (t2/insert! :health_inspector_runs (-> result
                                           (select-keys [:health :message])
                                           (assoc :check_name (name check-name))))))

(defn list-runs
  "Return the most recent health inspector runs from the DB."
  []
  (t2/select :health_inspector_runs {:limit 32 :order-by [:run_at]}))

(task/defjob ^:private SaveReport [_]
  (save-report))

(defmethod task/init! ::SaveReport [_]
  (let [job-key (jobs/key "metabase.health-inspector.job")
        trigger-key (triggers/key "metabase.health-inspector.trigger")
        job (jobs/build
             (jobs/of-type SaveReport)
             (jobs/with-identity job-key)
             (jobs/with-description "Gather health checks.")
             (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/start-now)
                 ;; 2AM every day
                 (triggers/with-schedule (cron/cron-schedule "0 0 2 * * ? *")))]
    (task/schedule-task! job trigger)))
