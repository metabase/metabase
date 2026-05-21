(ns metabase.health-inspector.core
  (:require
   [clojure.core.reducers :as r]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema :as schema]
   [metabase.task.core :as task]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- validate-query [{:keys [dataset_query]}]
  (let [query (lib-be/normalize-query (json/decode dataset_query keyword))]
    (mr/validate ::schema/query query)))

(defn- percent [n] (* 100 (int n)))

(defn- validate-queries []
  (let [queries (t2/reducible-select :report_card {:where [:= :archived false]})
        results (into [] (r/map validate-query queries))
        ratio (/ (count (filter identity results)) (count results))]
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

(mr/def ::result [:map [:health number?] [:message string?]])
(mr/def ::report [:map keyword? ::result])

(defn report
  "Run all registered checks and produce a report describing potential problems."
  []
  (into {} (for [[name f] @checks]
             [name (f)])))

(defn list-runs
  "Return the most recent runs from the DB."
  []
  (t2/select :health_inspector_runs {:limit 32 :order-by [:run_at]}))

(defn save-report
  "Run a health inspector report and save it to the DB."
  []
  (doseq [[check-name result] (report)]
    (t2/insert! :health_inspector_runs (-> result
                                           (select-keys [:health :message])
                                           (assoc :check_name (name check-name))))))

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

(def ^{:arglists '([request respond raise])} routes
  "`/api/health-inspector` routes."
  (api.macros/ns-handler 'metabase.health-inspector.core))

(api.macros/defendpoint :get "/"
  "lol"
  [_route-params
   _query-params
   _body]
  (api/check-superuser)
  {:status 200
   :body (list-runs)})
