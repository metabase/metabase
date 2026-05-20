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

(defn- validate-query [{:keys [dataset_query]}]
  (let [query (lib-be/normalize-query (json/decode dataset_query keyword))]
    (mr/validate ::schema/query query)))

(defn- validate-queries []
  (let [queries (t2/reducible-select :report_card {:where [:= :archived false]})
        results (into [] (r/map validate-query queries))]
    {:health (/ (count (filter identity results)) (count results))
     :description "Proportion of queries that are valid."}))

(def ^:private checks (atom {:validate-queries validate-queries}))

(defn register-check!
  "Register a new check function with a given name.
  Check functions take no args and return a map with a :health ratio and :description string."
  [name check-fn]
  (swap! checks assoc name check-fn))

(mr/def ::report [:map [:health number?] [:description string?]])

;; DB schema: health_inspector_reports
;; id: UUID? integer?
;; 

(defn report
  "Run all registered checks and produce a report describing potential problems."
  []
  (into {} (for [[name f] @checks]
             [name (f)])))

;; where to start looking for adding a new table
;; where to start for adding a REST endpoint

(defn- save-report [])

(def ^:private job-key     (jobs/key "metabase.health-inspector.job"))
(def ^:private trigger-key (triggers/key "metabase.health-inspector.trigger"))

(task/defjob SaveReport [_]
  (save-report))

(defmethod task/init! ::SaveReport [_]
  (let [job (jobs/build
             (jobs/of-type SaveReport)
             (jobs/with-identity job-key)
             (jobs/with-description "Gather health checks.")
             (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity trigger-key)
                 (triggers/for-job job-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; Run every day at 2 AM
                   (cron/cron-schedule "0 0 2 * * ? *")))]
    (task/schedule-task! job trigger)))
